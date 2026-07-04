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

/**
 * Presupuestos de espera de la entrada. `frontend.ready` tiene ademas un
 * watchdog interno en el panel (reintento de HTML a los 5s), asi que 12s
 * cubren un boot normal y un reintento completo antes de rendirse.
 */
const frontendReadyTimeoutMs = 12_000;
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
 * Cuando el frontend confirma que la ruta esta pintada (frontend.revealed),
 * se hace el unico cambio de layout: panel al grupo derecho (1/3, bloqueado)
 * con el archivo del usuario a la izquierda. Si Lumen Mode ya esta activo,
 * solo se revela el panel existente.
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

    // HTML preleido: la creacion del panel y su contenido comparten turno.
    const rawHtml = await readLumenFrontendIndexHtml(context);

    await context.globalState.update(bootIntentKey, {
      requestedAt: Date.now(),
      requestedMode: "route",
      phase: "mock-route-path-view",
      workspaceAction: entryState.workspace.action
    });

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

    // La ruta esta pintada cuando el intro se descarta; si la señal no llega
    // (p. ej. WebGL degradado), se continua igual y el frontend recibira la
    // fase "active" que fuerza el descarte del intro.
    await panel.waitForRevealed(frontendRevealTimeoutMs);

    // Unico cambio de layout de toda la entrada, ya sin cargas en vuelo.
    await panel.moveAsideAndLock();

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
