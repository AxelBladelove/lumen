import * as vscode from "vscode";
import { resolveLumenEntryState } from "./lumenEntryState";
import {
  activateLumenModeZen,
  closeEmptyEditorGroups,
  prepareLumenModeLayout,
  restoreLumenModeLayout
} from "./lumenLayout";
import type { LumenPanelController } from "./lumenPanel";
import type { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";

const bootIntentKey = "lumen.bootIntent";
const bootIntentMaxAgeMs = 2 * 60 * 1000;

type LumenBootIntent = {
  pendingOpen: true;
  requestedAt: number;
};

/**
 * Presupuestos de espera de la entrada. `frontend.ready` tiene ademas un
 * watchdog interno en el panel (reintento de HTML a los 5s), asi que 12s
 * cubren un boot normal y un reintento completo antes de rendirse.
 */
const frontendReadyTimeoutMs = 12_000;
const frontendLayoutHandoffTimeoutMs = 10_000;
const frontendLayoutCommitArmedTimeoutMs = 2_000;
const frontendLayoutHandoffPreparedTimeoutMs = 2_000;
const frontendRevealTimeoutMs = 10_000;

type LumenModeDeps = {
  context: vscode.ExtensionContext;
  launcher: LumenRoutePathViewProvider;
  panel: LumenPanelController;
};

/**
 * Estado de sesion de Lumen Mode dentro de este Extension Host. No sobrevive a
 * reloads: la restauracion tras reload la maneja cleanupStaleLumenLayout().
 */
const session = {
  active: false,
  transitioning: false
};

export function isLumenModeActive() {
  return session.active;
}

/**
 * Retoma una entrada solicitada antes de `vscode.openFolder`. El intent se
 * consume siempre: solo uno reciente y ya dentro de ~/.lumen puede autoabrir.
 */
export async function resumePendingLumenOpen(deps: LumenModeDeps) {
  const bootIntent = deps.context.globalState.get<unknown>(bootIntentKey);
  if (bootIntent === undefined) return false;

  const workspaceState = resolveLumenEntryState().workspace;
  const shouldResume = isRecentBootIntent(bootIntent) && workspaceState.isInLumenWorkspace;

  try {
    await deps.context.globalState.update(bootIntentKey, undefined);
  } catch (error) {
    console.error("Failed to clear Lumen boot intent", error);
    await vscode.window.showErrorMessage(
      "Lumen no pudo limpiar la solicitud de inicio pendiente. Intenta abrir Lumen nuevamente."
    );
    return true;
  }

  if (shouldResume) await enterLumenMode(deps);
  return true;
}

/**
 * Secuencia de entrada (enter-lumen-mode.md):
 *
 * click en icono / comando -> preparar settings (invisible) -> crear el panel
 * de Lumen a PANTALLA COMPLETA en el grupo activo + Zen Mode en el mismo
 * turno. La cortina de carga vive dentro del HTML del panel (logo + barra +
 * porcentaje), asi que no existe un panel de cortina separado y, critico:
 * NINGUNA mutacion de layout ocurre mientras el webview carga sus modulos.
 * (Un cambio de layout a mitad del boot corrompia la carga del bundle y la
 * cortina quedaba congelada para siempre.)
 *
 * Orden crítico del final: tras `frontend.ready`, el host asigna un token a la
 * entrada. La barra termina y el frontend hace el punch-in A PANTALLA COMPLETA.
 * En el punto óptico cubierto, el host ordena pintar la UI de ruta sin intro y
 * espera una confirmación post-paint con ese mismo token. Sólo entonces mueve
 * el panel. Una textura atrasada de Chromium ya es, por construcción, un frame
 * válido de la UI y nunca el logo al máximo zoom. Si el usuario
 * entra sin ningun archivo abierto, el grupo izquierdo queda vacio y se mantiene
 * asi gracias a `workbench.editor.closeEmptyGroups: false` (ver lumenLayout) —
 * sin abrir ningun documento placeholder. Si Lumen Mode ya esta activo, solo se
 * revela el panel existente.
 */
export async function enterLumenMode(deps: LumenModeDeps) {
  const { context, launcher, panel } = deps;

  if (session.transitioning) return;

  const entryState = resolveLumenEntryState();

  if (session.active && panel.exists) {
    panel.setEntryState(entryState);
    await panel.reveal();
    return;
  }

  session.transitioning = true;
  // Fase "entering" desde ya: el evento de visibilidad del launcher no debe
  // re-entrar ni volver a cerrar el sidebar de Lumen.
  launcher.setPhase("entering");
  panel.setPhase("entering");

  try {
    if (entryState.workspace.action !== "ready") {
      await switchToLumenWorkspace(context, entryState.workspace);
      launcher.setPhase("idle");
      panel.setPhase("idle");
      return;
    }

    const rawHtml = await panel.getPreloadedFrontendHtml();
    await vscode.commands.executeCommand("setContext", "lumen.inMode", true);
    await vscode.commands.executeCommand("setContext", "lumen.mode", "route");

    panel.setEntryState(entryState);
    await prepareLumenModeLayout(context);

    // Si el grupo activo quedo bloqueado (p. ej. lock residual de una sesion
    // de Lumen que murio sin exit), VS Code desviaria el panel a un grupo
    // nuevo y el boot no seria a pantalla completa. Desbloquear es no-op en
    // grupos normales.
    await vscode.commands
      .executeCommand("workbench.action.unlockEditorGroup")
      .then(undefined, () => undefined);

    // Crear primero el panel conserva el layout actual mientras Chromium prepara
    // su primera pintura. Si Zen o el cierre del sidebar se adelantan, VS Code
    // expande un webview todavía transparente y deja ver el fondo desnudo.
    panel.createFullScreen(rawHtml);

    // El panel reintenta el HTML una vez por su cuenta (watchdog) si el primer
    // boot no reporta ready. Sólo después de esta barrera visual se permite
    // cambiar el layout: el primer frame fullscreen ya contiene la cortina.
    const ready = await panel.waitForReady(frontendReadyTimeoutMs);
    if (!ready) {
      throw new Error("Lumen frontend did not become ready in time");
    }

    const sidebarClosing = vscode.commands
      .executeCommand("workbench.action.closeSidebar")
      .then(undefined, () => undefined);
    const zenActivating = activateLumenModeZen();
    await Promise.all([sidebarClosing, zenActivating]);

    // Prearmar durante la carga elimina un roundtrip posterior al punch-in. El
    // token liga todas las fases a esta entrada; un resize o mensaje atrasado
    // no puede consumir la transición de otra sesión.
    const layoutTransitionToken = panel.requestLayoutCommit();
    const commitArmed = await panel.waitForLayoutCommitArmed(frontendLayoutCommitArmedTimeoutMs);
    if (!commitArmed) {
      throw new Error("Lumen frontend did not arm the layout commit in time");
    }

    // La señal se agenda al arrancar el punch-in, pero su delay se cumple en el
    // Extension Host. Así Chromium no puede convertir el tramo cubierto en una
    // pausa por throttling de timers del iframe.
    const handoffReady = await panel.waitForLayoutHandoff(frontendLayoutHandoffTimeoutMs);
    if (!handoffReady) {
      throw new Error("Lumen frontend did not reach the covered layout handoff in time");
    }

    // Antes del único cambio de layout, sustituir la cortina por el primer frame
    // congelado del landing y exigir dos oportunidades completas de pintura.
    // Si el workbench reutiliza una textura vieja al recomponer, esa textura ya
    // es intro-free.
    if (!panel.requestLayoutHandoffPreparation()) {
      throw new Error("Lumen layout handoff has no active transition token");
    }
    const handoffPrepared = await panel.waitForLayoutHandoffPrepared(
      frontendLayoutHandoffPreparedTimeoutMs
    );
    if (!handoffPrepared) {
      throw new Error("Lumen frontend did not paint the safe layout handoff in time");
    }

    // Único cambio de layout de toda la entrada.
    const layoutMoved = await panel.moveAsideAndLock();
    if (!layoutMoved) {
      throw new Error("Lumen could not confirm the final editor layout");
    }

    // El token de commit es la única autorización para arrancar el zoom-out.
    if (!panel.confirmLayoutCommitted()) {
      throw new Error("Lumen layout commit lost its active transition token");
    }

    const revealed = await panel.waitForRevealed(frontendRevealTimeoutMs);
    if (!revealed || !panel.canActivateLayoutTransition(layoutTransitionToken)) {
      throw new Error("Lumen frontend did not commit the final layout in time");
    }

    session.active = true;
    launcher.setPhase("active");
    panel.setPhase("active");
  } catch (error) {
    // Entrada fallida: no dejar el workspace a medio camino.
    session.active = false;
    await panel.disposeForExit().catch(() => undefined);
    await restoreLumenModeLayout(context, { exitZen: true }).catch(() => undefined);
    await vscode.commands.executeCommand("setContext", "lumen.inMode", false);
    await vscode.commands.executeCommand("setContext", "lumen.mode", undefined);
    launcher.setPhase("idle");
    panel.setPhase("idle");
    throw error;
  } finally {
    session.transitioning = false;
  }
}

async function switchToLumenWorkspace(
  context: vscode.ExtensionContext,
  workspaceState: ReturnType<typeof resolveLumenEntryState>["workspace"]
) {
  if (!(await saveDirtyDocuments())) return;
  if (!(await ensureOfficialWorkspaceExists(workspaceState))) return;

  const bootIntent: LumenBootIntent = {
    pendingOpen: true,
    requestedAt: Date.now()
  };

  try {
    await context.globalState.update(bootIntentKey, bootIntent);
  } catch (error) {
    console.error("Failed to persist Lumen boot intent", error);
    await vscode.window.showErrorMessage(
      "Lumen no pudo preparar el cambio de workspace. Tu proyecto actual permanece abierto."
    );
    return;
  }

  try {
    await vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(workspaceState.officialWorkspacePath),
      { forceReuseWindow: true }
    );
  } catch (error) {
    console.error("Failed to open the Lumen workspace", error);
    await context.globalState.update(bootIntentKey, undefined).then(undefined, () => undefined);
    await vscode.window.showErrorMessage(
      "Lumen no pudo abrir su workspace. Revisa que la carpeta exista y que VS Code tenga permisos para abrirla."
    );
  }
}

async function saveDirtyDocuments() {
  if (!hasDirtyDocuments()) return true;

  try {
    const saved = await vscode.workspace.saveAll(false);
    if (saved && !hasDirtyDocuments()) return true;
  } catch (error) {
    console.error("Failed to save dirty documents before opening Lumen", error);
  }

  await vscode.window.showWarningMessage(
    "Lumen no cambió de workspace porque quedó trabajo sin guardar. Guarda o cierra los documentos pendientes e inténtalo de nuevo."
  );
  return false;
}

function hasDirtyDocuments() {
  return (
    vscode.workspace.textDocuments.some((document) => document.isDirty) ||
    vscode.workspace.notebookDocuments.some((document) => document.isDirty)
  );
}

async function ensureOfficialWorkspaceExists(
  workspaceState: ReturnType<typeof resolveLumenEntryState>["workspace"]
) {
  if (workspaceState.officialWorkspaceExists) return true;

  const create = "Crear";
  const choice = await vscode.window.showInformationMessage(
    `La carpeta de Lumen no existe en ${workspaceState.officialWorkspacePath}.`,
    {
      modal: true,
      detail: "Lumen necesita crear esta carpeta para guardar y abrir su workspace oficial."
    },
    create
  );
  if (choice !== create) return false;

  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(workspaceState.officialWorkspacePath));
    return true;
  } catch (error) {
    console.error("Failed to create the Lumen workspace", error);
    await vscode.window.showErrorMessage(
      "Lumen no pudo crear su carpeta. Revisa los permisos de tu directorio de usuario e inténtalo de nuevo."
    );
    return false;
  }
}

function isRecentBootIntent(value: unknown): value is LumenBootIntent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LumenBootIntent>;
  if (candidate.pendingOpen !== true || typeof candidate.requestedAt !== "number") return false;

  const age = Date.now() - candidate.requestedAt;
  return Number.isFinite(candidate.requestedAt) && age >= 0 && age < bootIntentMaxAgeMs;
}

/**
 * Salida minima (exit-lumen-mode.md): cerrar el panel de Lumen (desbloqueando
 * su grupo), salir de Zen Mode, revertir los overrides de settings y limpiar
 * context keys. Los grupos vacios restantes se cierran para no dejar huecos.
 */
export async function exitLumenMode(deps: LumenModeDeps) {
  const { context, launcher, panel } = deps;

  if (session.transitioning) return;
  session.transitioning = true;

  try {
    session.active = false;

    await panel.disposeForExit();
    await restoreLumenModeLayout(context, { exitZen: true });
    await closeEmptyEditorGroups();

    await context.globalState.update(bootIntentKey, undefined);
    await vscode.commands.executeCommand("setContext", "lumen.inMode", false);
    await vscode.commands.executeCommand("setContext", "lumen.mode", undefined);

    launcher.setPhase("idle");
    panel.setPhase("idle");
  } finally {
    session.transitioning = false;
  }
}
