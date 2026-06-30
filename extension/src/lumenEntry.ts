import * as vscode from "vscode";
import { resolveLumenEntryState } from "./lumenEntryState";
import { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";

const bootIntentKey = "lumen.bootIntent";

export async function enterLumenMode(
  context: vscode.ExtensionContext,
  provider: LumenRoutePathViewProvider
) {
  const entryState = resolveLumenEntryState();

  await context.globalState.update(bootIntentKey, {
    requestedAt: Date.now(),
    requestedMode: "route",
    phase: "mock-route-path-view",
    workspaceAction: entryState.workspace.action
  });

  await vscode.commands.executeCommand("setContext", "lumen.inMode", true);
  await vscode.commands.executeCommand("setContext", "lumen.mode", "route");
  await vscode.commands.executeCommand("workbench.view.extension.lumen");
  await vscode.commands
    .executeCommand(`${LumenRoutePathViewProvider.viewType}.focus`)
    .then(undefined, () => undefined);

  provider.setEntryState(entryState);
}

export async function exitLumenMode(
  context: vscode.ExtensionContext,
  provider: LumenRoutePathViewProvider
) {
  await context.globalState.update(bootIntentKey, undefined);
  await vscode.commands.executeCommand("setContext", "lumen.inMode", false);
  await vscode.commands.executeCommand("setContext", "lumen.mode", undefined);

  provider.setEntryState({
    ...resolveLumenEntryState(false),
    inMode: false
  });
}
