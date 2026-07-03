import * as vscode from "vscode";

/**
 * Layout enfocado de Lumen Mode (Architectural-plans/extension-host/lumen-mode/layout.md).
 *
 * Base visual: Zen Mode con la configuracion default de Lumen, aplicada como
 * override de workspace (no toca settings de usuario) y revertida al salir.
 * `zenMode.centerLayout: false` deja el editor sin margenes centrados.
 * `zenMode.restore: false` evita que VS Code re-entre a Zen tras un reload sin
 * pasar por `lumen.enterMode`.
 */
const lumenZenModeSettings: Record<string, unknown> = {
  "zenMode.centerLayout": false,
  "zenMode.fullScreen": true,
  "zenMode.hideActivityBar": true,
  "zenMode.hideLineNumbers": true,
  "zenMode.hideStatusBar": true,
  "zenMode.showTabs": "none",
  "zenMode.silentNotifications": true,
  "zenMode.restore": false
};

/**
 * Dentro de Lumen Mode el sidebar primario (donde vive la vista de Lumen) se
 * mueve a la derecha: codigo en el centro, Lumen a la derecha. Se aplica
 * mientras Zen Mode tiene el sidebar oculto para que el usuario no vea el
 * salto, y se revierte al salir.
 */
const lumenSidebarSettings: Record<string, unknown> = {
  "workbench.sideBar.location": "right"
};

const allLumenLayoutSettings: Record<string, unknown> = {
  ...lumenZenModeSettings,
  ...lumenSidebarSettings
};

const layoutRestoreKey = "lumen.layoutRestore";

type LayoutRestoreState = {
  savedAt: number;
  workspaceValues: Record<string, unknown>;
};

export async function applyLumenModeLayout(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration();

  // Snapshot para Exit Mode. Si ya existe uno (sesion anterior que no llego a
  // salir), se conserva: representa el estado real previo a Lumen.
  if (!context.workspaceState.get<LayoutRestoreState>(layoutRestoreKey)) {
    const workspaceValues: Record<string, unknown> = {};
    for (const key of Object.keys(allLumenLayoutSettings)) {
      workspaceValues[key] = config.inspect(key)?.workspaceValue ?? null;
    }
    await context.workspaceState.update(layoutRestoreKey, {
      savedAt: Date.now(),
      workspaceValues
    } satisfies LayoutRestoreState);
  }

  for (const [key, value] of Object.entries(lumenZenModeSettings)) {
    await updateWorkspaceSetting(config, key, value);
  }

  // Entrada determinista a Zen Mode: exitZenMode tiene precondicion inZenMode
  // (no-op fuera de Zen), asi el toggle siguiente siempre significa "entrar".
  await executeCommandSafely("workbench.action.exitZenMode");
  await executeCommandSafely("workbench.action.toggleZenMode");

  // Con el sidebar oculto por Zen, moverlo a la derecha no produce saltos
  // visibles; enter-lumen-mode lo reabre despues enfocando la vista de Lumen.
  for (const [key, value] of Object.entries(lumenSidebarSettings)) {
    await updateWorkspaceSetting(config, key, value);
  }
}

export async function restoreLumenModeLayout(
  context: vscode.ExtensionContext,
  options: { exitZen: boolean }
) {
  if (options.exitZen) {
    await executeCommandSafely("workbench.action.exitZenMode");
    // Al salir de Zen, VS Code restaura el sidebar previo, que puede ser el
    // launcher de Lumen (el usuario acaba de clickear el icono). Se cierra para
    // no re-disparar la entrada y dejar un workspace neutro.
    await executeCommandSafely("workbench.action.closeSidebar");
  }

  await restoreLumenLayoutSettings(context);
}

/**
 * Limpieza al activar la extension: si una sesion anterior murio dentro de
 * Lumen Mode (reload/crash), los overrides de zenMode.* seguirian aplicados.
 * Se restauran desde el snapshot sin tocar el layout visible.
 */
export async function cleanupStaleLumenLayout(context: vscode.ExtensionContext) {
  if (!context.workspaceState.get<LayoutRestoreState>(layoutRestoreKey)) return false;
  await restoreLumenLayoutSettings(context);
  return true;
}

async function restoreLumenLayoutSettings(context: vscode.ExtensionContext) {
  const stored = context.workspaceState.get<LayoutRestoreState>(layoutRestoreKey);
  const config = vscode.workspace.getConfiguration();

  for (const key of Object.keys(allLumenLayoutSettings)) {
    const previous = stored?.workspaceValues?.[key];
    await updateWorkspaceSetting(config, key, previous ?? undefined);
  }

  await context.workspaceState.update(layoutRestoreKey, undefined);
}

async function updateWorkspaceSetting(
  config: vscode.WorkspaceConfiguration,
  key: string,
  value: unknown
) {
  try {
    await config.update(key, value ?? undefined, vscode.ConfigurationTarget.Workspace);
  } catch {
    // Sin workspace abierto no hay target Workspace; Zen Mode usa entonces la
    // configuracion propia del usuario. Preferible a escribir settings globales.
  }
}

async function executeCommandSafely(command: string) {
  try {
    await vscode.commands.executeCommand(command);
  } catch {
    // Comando no disponible o precondicion no cumplida: continuar.
  }
}
