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
import { readLumenFrontendIndexHtml } from "./lumenWebviewContent";

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
const frontendLoadingCompleteTimeoutMs = 10_000;
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
 * Orden critico del final (fix del salto fullscreen): el layout se coloca
 * ANTES de revelar la UI. Cuando el frontend reporta que la barra llego a 100%
 * y la ruta ya rindio (frontend.loadingComplete) —con la cortina todavia a
 * pantalla completa— se hace el unico cambio de layout: panel al grupo derecho
 * (1/3, bloqueado) con un editor a la izquierda. Recien entonces se le ordena
 * al frontend revelar (signalReveal): el fade descubre la UI ya en la vista
 * dividida, sin pasar por un frame del modulo a pantalla completa. Si el usuario
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
    // El click en el icono abre el sidebar con el launcher a medio pintar.
    // Se cierra de inmediato: durante la preparacion invisible (settings,
    // snapshot, contextos) el usuario no ve ningun cambio.
    await vscode.commands
      .executeCommand("workbench.action.closeSidebar")
      .then(undefined, () => undefined);

    if (entryState.workspace.action !== "ready") {
      await switchToLumenWorkspace(context, entryState.workspace);
      launcher.setPhase("idle");
      panel.setPhase("idle");
      return;
    }

    // HTML preleido: la creacion del panel y su contenido comparten turno.
    const rawHtml = await readLumenFrontendIndexHtml(context);

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

    // Panel (con su cortina estatica) y Zen Mode en el mismo turno, sin
    // awaits entre medio: el chrome se oculta en el mismo ciclo de render en
    // el que aparece la cortina, sin frames de tab bar ni de editor desnudo.
    panel.createFullScreen(rawHtml);
    await activateLumenModeZen();

    // Boot del frontend a pantalla completa, sin tocar el layout. El panel
    // reintenta el HTML una vez por su cuenta (watchdog) si el primer boot
    // no reporta ready.
    const ready = await panel.waitForReady(frontendReadyTimeoutMs);
    if (!ready) {
      throw new Error("Lumen frontend did not become ready in time");
    }

    // La barra llego a 100% y la ruta ya rindio, pero la cortina sigue a
    // pantalla completa (el frontend espera el OK del layout para revelar). Si
    // la señal no llega (p. ej. WebGL degradado), se continua igual: el frontend
    // tiene su propio fallback de revelado y aqui igual se coloca el layout.
    await panel.waitForLoadingComplete(frontendLoadingCompleteTimeoutMs);

    // Unico cambio de layout de toda la entrada, ya sin cargas en vuelo y
    // TODAVIA detras de la cortina: al terminar, el split ya esta colocado.
    await panel.moveAsideAndLock();

    // Layout listo: ahora si se revela. El fade descubre la UI ya dividida,
    // sin frame intermedio del modulo a pantalla completa.
    panel.signalReveal();

    // Confirmacion de que el fade termino antes de marcar la sesion activa.
    await panel.waitForRevealed(frontendRevealTimeoutMs);

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
