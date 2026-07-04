import * as vscode from "vscode";
import { resolveLumenEntryState } from "./lumenEntryState";
import { activateLumenModeZen, prepareLumenModeLayout, restoreLumenModeLayout } from "./lumenLayout";
import { showLumenLoadingPanel } from "./lumenLoadingPanel";
import type { LumenPanelController } from "./lumenPanel";
import type { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";

const bootIntentKey = "lumen.bootIntent";
const loadingCurtainDurationMs = 1800;
const loadingRevealSettleMs = 120;

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
 * click en icono / comando -> Zen Mode (editor al centro, sin distracciones)
 * -> panel de editor a la derecha. El archivo que el usuario tuviera abierto
 * permanece en el grupo izquierdo. Si Lumen Mode ya esta activo, solo revela
 * el panel existente.
 */
export async function enterLumenMode(deps: LumenModeDeps) {
  const { context, launcher, panel } = deps;

  if (session.transitioning) return;

  const entryState = resolveLumenEntryState();

  if (session.active) {
    panel.setEntryState(entryState);
    await panel.reveal();
    return;
  }

  session.transitioning = true;
  // Fase "entering" desde ya: el evento de visibilidad del launcher no debe
  // re-entrar ni volver a cerrar el sidebar de Lumen.
  launcher.setPhase("entering");
  panel.setPhase("entering");
  let loadingPanel: vscode.WebviewPanel | undefined;

  try {
    // El click en el icono abre el sidebar con la vista todavia gris a medio
    // cargar. Se cierra de inmediato: mientras dura la preparacion invisible
    // (settings, snapshot, contextos) el usuario no ve ningun cambio.
    await vscode.commands
      .executeCommand("workbench.action.closeSidebar")
      .then(undefined, () => undefined);

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

    // Cortina y Zen Mode en el mismo turno, sin awaits entre medio: el panel
    // de carga no llega a verse como una pestana normal del editor porque el
    // chrome se oculta en el mismo ciclo de render.
    loadingPanel = showLumenLoadingPanel(context);
    await activateLumenModeZen();

    await delay(loadingCurtainDurationMs);

    await panel.reveal();

    session.active = true;
    launcher.setPhase("active");
    panel.setPhase("active");
    await delay(loadingRevealSettleMs);
    loadingPanel.dispose();
  } catch (error) {
    // Entrada fallida: no dejar el workspace a medio camino.
    session.active = false;
    await restoreLumenModeLayout(context, { exitZen: true }).catch(() => undefined);
    await vscode.commands.executeCommand("setContext", "lumen.inMode", false);
    await vscode.commands.executeCommand("setContext", "lumen.mode", undefined);
    launcher.setPhase("idle");
    panel.setPhase("idle");
    loadingPanel?.dispose();
    throw error;
  } finally {
    session.transitioning = false;
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Salida minima (exit-lumen-mode.md): cerrar el panel de Lumen, salir de Zen
 * Mode, revertir los overrides de settings y limpiar context keys.
 */
export async function exitLumenMode(deps: LumenModeDeps) {
  const { context, launcher, panel } = deps;

  if (session.transitioning) return;
  session.transitioning = true;

  try {
    session.active = false;

    await panel.disposeForExit();
    await restoreLumenModeLayout(context, { exitZen: true });

    await context.globalState.update(bootIntentKey, undefined);
    await vscode.commands.executeCommand("setContext", "lumen.inMode", false);
    await vscode.commands.executeCommand("setContext", "lumen.mode", undefined);

    launcher.setPhase("idle");
    panel.setPhase("idle");
  } finally {
    session.transitioning = false;
  }
}
