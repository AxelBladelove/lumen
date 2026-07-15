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
 * Con el default (`true`), al mover el panel de Lumen al grupo derecho cuando el
 * usuario entra SIN ningun archivo abierto, el grupo izquierdo queda vacio y VS
 * Code lo cierra al instante, devolviendo Lumen a pantalla completa. En `false`
 * el grupo izquierdo vacio persiste de forma estable, dejando el layout base
 * editor-izquierda + Lumen-derecha sin necesidad de abrir ningun documento
 * placeholder (nada de `Untitled`). Se aplica como override de workspace, se
 * snapshotea junto al resto y se revierte al salir; ademas `closeEmptyEditorGroups`
 * limpia el hueco explicitamente en Exit Mode y en la limpieza post-crash.
 */
const lumenEmptyGroupSettings: Record<string, unknown> = {
  "workbench.editor.closeEmptyGroups": false
};

const allLumenLayoutSettings: Record<string, unknown> = {
  ...lumenZenModeSettings,
  ...lumenEmptyGroupSettings
};

const layoutRestoreKey = "lumen.layoutRestore";

type LayoutRestoreState = {
  savedAt: number;
  workspaceValues: Record<string, unknown>;
};

export async function prepareLumenModeLayout(context: vscode.ExtensionContext) {
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

  // Todas las escrituras de settings son lentas pero invisibles: Zen todavía
  // no se activó y el layout permanece intacto. El panel se crea después y
  // sólo tras pintar su cortina se cierra el sidebar y se activa Zen.
  for (const [key, value] of Object.entries(allLumenLayoutSettings)) {
    await updateWorkspaceSetting(config, key, value);
  }

  // Entrada determinista a Zen Mode: exitZenMode tiene precondicion inZenMode
  // (no-op fuera de Zen), asi el toggle siguiente siempre significa "entrar".
  await executeCommandSafely("workbench.action.exitZenMode");
}

export async function activateLumenModeZen() {
  await executeCommandSafely("workbench.action.toggleZenMode");
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
 * Lumen Mode (reload/crash), los overrides de zenMode.* seguirian aplicados y
 * el grupo (bloqueado) que alojaba al panel puede haber quedado vacio en el
 * layout persistido. Se restauran los settings y se cierran esos huecos.
 */
export async function cleanupStaleLumenLayout(context: vscode.ExtensionContext) {
  if (!context.workspaceState.get<LayoutRestoreState>(layoutRestoreKey)) return false;
  await restoreLumenLayoutSettings(context);
  await closeEmptyEditorGroups();
  return true;
}

const focusGroupCommands = [
  "workbench.action.focusFirstEditorGroup",
  "workbench.action.focusSecondEditorGroup",
  "workbench.action.focusThirdEditorGroup",
  "workbench.action.focusFourthEditorGroup",
  "workbench.action.focusFifthEditorGroup",
  "workbench.action.focusSixthEditorGroup",
  "workbench.action.focusSeventhEditorGroup",
  "workbench.action.focusEighthEditorGroup"
];

/**
 * Cierra grupos de editor sin tabs. VS Code lo hace solo para grupos normales
 * (workbench.editor.closeEmptyGroups), pero los grupos BLOQUEADOS —como el
 * que aloja el panel de Lumen— sobreviven vacios a un reload/crash; hay que
 * desbloquearlos antes de cerrarlos.
 */
export async function closeEmptyEditorGroups() {
  for (let attempt = 0; attempt < focusGroupCommands.length; attempt++) {
    const groups = vscode.window.tabGroups.all;
    if (groups.length <= 1) return;
    const emptyIndex = groups.findIndex((group) => group.tabs.length === 0);
    if (emptyIndex < 0 || emptyIndex >= focusGroupCommands.length) return;

    await executeCommandSafely(focusGroupCommands[emptyIndex]);
    await executeCommandSafely("workbench.action.unlockEditorGroup");
    await executeCommandSafely("workbench.action.closeGroup");

    if (vscode.window.tabGroups.all.length >= groups.length) return;
  }
}

async function restoreLumenLayoutSettings(context: vscode.ExtensionContext) {
  const stored = context.workspaceState.get<LayoutRestoreState>(layoutRestoreKey);
  const config = vscode.workspace.getConfiguration();

  const keysToRestore = new Set([
    ...Object.keys(allLumenLayoutSettings),
    ...Object.keys(stored?.workspaceValues ?? {})
  ]);

  for (const key of keysToRestore) {
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
