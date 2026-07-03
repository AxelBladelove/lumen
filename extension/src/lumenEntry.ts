import * as vscode from "vscode";
import { resolveLumenEntryState } from "./lumenEntryState";
import { applyLumenModeLayout, restoreLumenModeLayout } from "./lumenLayout";
import { showLumenLoadingPanel } from "./lumenLoadingPanel";
import type { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";

const bootIntentKey = "lumen.bootIntent";
const loadingCurtainDurationMs = 1800;
const loadingRevealSettleMs = 120;

type LumenModeDeps = {
  context: vscode.ExtensionContext;
  provider: LumenRoutePathViewProvider;
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
 * -> sidebar a la derecha -> revelar la vista de Lumen en el sidebar derecho.
 * El archivo que el usuario tuviera abierto permanece en el editor. Si Lumen
 * Mode ya esta activo, solo revela la vista existente.
 */
export async function enterLumenMode(deps: LumenModeDeps) {
  const { context, provider } = deps;

  if (session.transitioning) return;

  const entryState = resolveLumenEntryState();

  if (session.active) {
    provider.setEntryState(entryState);
    await provider.reveal();
    return;
  }

  session.transitioning = true;
  let loadingPanel: vscode.WebviewPanel | undefined;

  try {
    await context.globalState.update(bootIntentKey, {
      requestedAt: Date.now(),
      requestedMode: "route",
      phase: "mock-route-path-view",
      workspaceAction: entryState.workspace.action
    });

    await vscode.commands.executeCommand("setContext", "lumen.inMode", true);
    await vscode.commands.executeCommand("setContext", "lumen.mode", "route");

    provider.setEntryState(entryState);
    await applyLumenModeLayout(context);

    loadingPanel = showLumenLoadingPanel(context);
    await delay(loadingCurtainDurationMs);

    await provider.reveal();

    session.active = true;
    provider.setPhase("active");
    await delay(loadingRevealSettleMs);
    loadingPanel.dispose();
  } catch (error) {
    // Entrada fallida: no dejar el workspace a medio camino.
    session.active = false;
    await restoreLumenModeLayout(context, { exitZen: true }).catch(() => undefined);
    await vscode.commands.executeCommand("setContext", "lumen.inMode", false);
    await vscode.commands.executeCommand("setContext", "lumen.mode", undefined);
    provider.setPhase("idle");
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
 * Salida minima (exit-lumen-mode.md): salir de Zen Mode (VS Code restaura el
 * layout previo), cerrar el sidebar de Lumen, revertir los overrides de
 * settings (incluida la posicion del sidebar) y limpiar context keys.
 */
export async function exitLumenMode(deps: LumenModeDeps) {
  const { context, provider } = deps;

  if (session.transitioning) return;
  session.transitioning = true;

  try {
    session.active = false;

    await restoreLumenModeLayout(context, { exitZen: true });

    await context.globalState.update(bootIntentKey, undefined);
    await vscode.commands.executeCommand("setContext", "lumen.inMode", false);
    await vscode.commands.executeCommand("setContext", "lumen.mode", undefined);

    provider.setPhase("idle");
  } finally {
    session.transitioning = false;
  }
}
