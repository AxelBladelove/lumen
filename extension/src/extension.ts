import * as vscode from "vscode";
import { enterLumenMode, exitLumenMode } from "./lumenEntry";
import { cleanupStaleLumenLayout } from "./lumenLayout";
import { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Lumen");
  context.subscriptions.push(outputChannel);

  const provider = new LumenRoutePathViewProvider(context, outputChannel, () => {
    void vscode.commands.executeCommand("lumen.enterMode");
  });

  const deps = { context, provider };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(LumenRoutePathViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand("lumen.open", () => enterLumenMode(deps)),
    vscode.commands.registerCommand("lumen.enterMode", () => enterLumenMode(deps)),
    vscode.commands.registerCommand("lumen.exitMode", () => exitLumenMode(deps)),
    vscode.commands.registerCommand("lumen.refreshWebview", async () => {
      const refreshed = await provider.refresh();
      if (!refreshed) await enterLumenMode(deps);
    })
  );

  // Una sesion anterior pudo morir dentro de Lumen Mode (reload/crash) dejando
  // los overrides de layout aplicados. Se restauran antes de cualquier uso.
  void cleanupStaleLumenLayout(context).then((restored) => {
    if (restored) outputChannel.appendLine("Restored layout settings from a previous Lumen Mode session.");
  });

  void vscode.commands.executeCommand("setContext", "lumen.inMode", false);

  shouldAutoOpenForPerformanceHarness().then((shouldAutoOpen) => {
    if (!shouldAutoOpen) return;
    setTimeout(() => {
      enterLumenMode(deps).then(undefined, (error) => {
        console.error("Failed to auto-open Lumen for performance harness", error);
      });
    }, 250);
  }, () => undefined);
}

export function deactivate() {}

async function shouldAutoOpenForPerformanceHarness() {
  if (process.env.LUMEN_PERF_AUTO_OPEN === "1") return true;

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const sentinel = vscode.Uri.joinPath(folder.uri, ".lumen-perf-auto-open");
    try {
      await vscode.workspace.fs.stat(sentinel);
      return true;
    } catch {
      // Sentinel is intentionally absent outside the perf harness.
    }
  }

  return false;
}
