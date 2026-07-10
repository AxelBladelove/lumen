import * as vscode from "vscode";
import { LumenEngineClient } from "./engine/lumenEngineClient";
import { LumenEngineError } from "./engine/lumenEngineProtocol";
import { enterLumenMode, exitLumenMode } from "./lumenEntry";
import { cleanupStaleLumenLayout } from "./lumenLayout";
import { LumenPanelController } from "./lumenPanel";
import { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";

let lumenEngineClient: LumenEngineClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Lumen");
  context.subscriptions.push(outputChannel);

  const engineClient = new LumenEngineClient(context, outputChannel);
  lumenEngineClient = engineClient;
  context.subscriptions.push(engineClient);

  const launcher = new LumenRoutePathViewProvider(() => {
    void vscode.commands.executeCommand("lumen.enterMode");
  });
  const panel = new LumenPanelController(context, outputChannel, () => {
    void vscode.commands.executeCommand("lumen.exitMode");
  });

  const deps = { context, launcher, panel };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(LumenRoutePathViewProvider.viewType, launcher, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand("lumen.open", () => enterLumenMode(deps)),
    vscode.commands.registerCommand("lumen.enterMode", () => enterLumenMode(deps)),
    vscode.commands.registerCommand("lumen.exitMode", () => exitLumenMode(deps)),
    vscode.commands.registerCommand("lumen.engineStatus", async () => {
      try {
        const health = await engineClient.healthCheck();
        await vscode.window.showInformationMessage(
          `Lumen Engine ${health.engineVersion}: database ${health.dbStatus}.`
        );
      } catch (error) {
        const detail = formatEngineError(error);
        outputChannel.appendLine(`Engine status failed: ${detail}`);
        await vscode.window.showErrorMessage(detail);
      }
    }),
    vscode.commands.registerCommand("lumen.refreshWebview", async () => {
      const refreshed = await panel.refresh();
      if (!refreshed) await enterLumenMode(deps);
    })
  );

  void engineClient.healthCheck().then(
    (health) => {
      outputChannel.appendLine(
        `Engine health: version=${health.engineVersion}, dbStatus=${health.dbStatus}, dbPath=${health.dbPath}`
      );
    },
    (error) => {
      outputChannel.appendLine(`Engine health check failed: ${formatEngineError(error)}`);
    }
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

export function deactivate() {
  lumenEngineClient?.dispose();
  lumenEngineClient = undefined;
}

function formatEngineError(error: unknown) {
  if (error instanceof LumenEngineError) return `${error.code}: ${error.message}`;
  return `ENGINE_START_FAILED: ${error instanceof Error ? error.message : String(error)}`;
}

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
