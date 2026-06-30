import * as vscode from "vscode";
import { enterLumenMode, exitLumenMode } from "./lumenEntry";
import { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new LumenRoutePathViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(LumenRoutePathViewProvider.viewType, provider),
    vscode.commands.registerCommand("lumen.open", () => enterLumenMode(context, provider)),
    vscode.commands.registerCommand("lumen.enterMode", () => enterLumenMode(context, provider)),
    vscode.commands.registerCommand("lumen.exitMode", () => exitLumenMode(context, provider)),
    vscode.commands.registerCommand("lumen.refreshWebview", () => provider.refresh())
  );
}

export function deactivate() {}
