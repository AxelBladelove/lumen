import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import { LumenEngineClient } from "./engine/lumenEngineClient";
import { LumenEngineError } from "./engine/lumenEngineProtocol";
import { LumenCompileController } from "./lumenCompile";
import { enterLumenMode, exitLumenMode, resumePendingLumenOpen } from "./lumenEntry";
import {
  resolveConsoleRunnerPath,
  waitForExternalRunToFinish
} from "./lumenExternalConsole";
import { cleanupStaleLumenLayout } from "./lumenLayout";
import { LumenPanelController } from "./lumenPanel";
import type { ExerciseRunKind } from "./lumenProtocol";
import { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";
import { LumenTestController } from "./lumenTest";

let lumenEngineClient: LumenEngineClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Lumen");
  context.subscriptions.push(outputChannel);
  void vscode.commands.executeCommand("setContext", "lumen.hasActiveExercise", false);

  const engineClient = new LumenEngineClient(context, outputChannel);
  lumenEngineClient = engineClient;
  context.subscriptions.push(engineClient);

  const runnerPath = resolveConsoleRunnerPath(context);
  const compileController = new LumenCompileController(engineClient, outputChannel, runnerPath);
  context.subscriptions.push(compileController);
  const testController = new LumenTestController(engineClient, outputChannel, runnerPath);
  context.subscriptions.push(testController);

  const launcher = new LumenRoutePathViewProvider(() => {
    void vscode.commands.executeCommand("lumen.enterMode");
  });
  let panel: LumenPanelController;
  const runCurrentExercise = async (kind: ExerciseRunKind) => {
    let started = false;
    const markStarted = () => {
      started = true;
      panel.postExerciseRunState(kind);
    };

    try {
      if (kind === "compile") {
        await compileController.compileCurrentExercise(markStarted);
      } else {
        await testController.testCurrentExercise(
          (exerciseId) => panel.postExerciseCompleted(exerciseId),
          markStarted
        );
      }
      if (started) await waitForExternalRunToFinish();
    } catch (error) {
      const detail = formatEngineError(error);
      const label = kind === "compile" ? "Compile" : "Test";
      outputChannel.appendLine(`${label} command failed: ${detail}`);
      await vscode.window.showErrorMessage(detail);
    } finally {
      if (started) panel.postExerciseRunState(null);
    }
  };
  panel = new LumenPanelController(
    context,
    outputChannel,
    engineClient,
    () => void vscode.commands.executeCommand("lumen.exitMode"),
    (kind) => void runCurrentExercise(kind)
  );

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
    }),
    vscode.commands.registerCommand("lumen.compileCurrentExercise", () =>
      runCurrentExercise("compile")
    ),
    vscode.commands.registerCommand("lumen.testCurrentExercise", () =>
      runCurrentExercise("test")
    ),
    vscode.commands.registerCommand("lumen.importExercise", async () => {
      const selection = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Importar",
        filters: { "Ejercicios Lumen": ["esex"] }
      });
      const esexPath = selection?.[0]?.fsPath;
      if (!esexPath) return;

      try {
        const result = await engineClient.importExercise(esexPath);
        const title = result.activity.title;
        const message = result.alreadyInstalled
          ? `Lumen: ${title} ${result.version} ya estaba instalada.`
          : `Lumen: importada ${title} ${result.version}.`;
        outputChannel.appendLine(
          `Import ${result.alreadyInstalled ? "no-op" : "ok"}: ${result.activityId}@${result.version} -> ${result.installPath}`
        );
        await vscode.window.showInformationMessage(message);

        // Tras importar, el ejercicio recién instalado se activa por el mismo
        // camino autoritativo que un click en su nodo: `exercise.activate` en el
        // engine, abrir el entrypoint en el grupo izquierdo y refrescar el
        // panel. Si Lumen Mode no está corriendo el activate no se ejecuta —
        // no hay panel al que refrescar y el usuario debe entrar primero.
        if (panel.exists) {
          await panel.activateAndOpenExercise(result.activityId);
        }
      } catch (error) {
        const detail = formatEngineError(error);
        outputChannel.appendLine(`Import command failed: ${detail}`);
        const firstDetail =
          error instanceof LumenEngineError && error.details && error.details.length > 0
            ? error.details[0]
            : undefined;
        const suffix = firstDetail
          ? ` (${firstDetail.code}: ${firstDetail.message}${firstDetail.path ? ` [${firstDetail.path}]` : ""})`
          : "";
        await vscode.window.showErrorMessage(`${detail}${suffix}`);
      }
    })
  );

  void engineClient.healthCheck().then(
    async (health) => {
      outputChannel.appendLine(
        `Engine health: version=${health.engineVersion}, dbStatus=${health.dbStatus}, dbPath=${health.dbPath}`
      );
      await seedBundledExercises(context, engineClient, outputChannel);
      await migrateOrPublishActiveExerciseContext(engineClient, outputChannel);
      if (panel.exists) await panel.refresh();
    },
    (error) => {
      outputChannel.appendLine(`Engine health check failed: ${formatEngineError(error)}`);
    }
  );

  void initializeLumenEntry(deps, outputChannel).then(undefined, (error) => {
    outputChannel.appendLine(`Failed to initialize Lumen entry: ${String(error)}`);
    void vscode.window.showErrorMessage(
      "Lumen no pudo inicializar su entrada. Intenta abrir Lumen nuevamente."
    );
  });
}

async function seedBundledExercises(
  context: vscode.ExtensionContext,
  engineClient: LumenEngineClient,
  outputChannel: vscode.OutputChannel
) {
  const packagesUri = vscode.Uri.joinPath(context.extensionUri, "content", "packages");
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(packagesUri);
  } catch {
    outputChannel.appendLine(`Bundled content directory not found: ${packagesUri.fsPath}`);
    return;
  }

  const packages = entries
    .filter(
      ([name, type]) =>
        (type & vscode.FileType.File) !== 0 && name.toLocaleLowerCase().endsWith(".esex")
    )
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
  for (const packageName of packages) {
    const packageUri = vscode.Uri.joinPath(packagesUri, packageName);
    try {
      const imported = await engineClient.importExercise(packageUri.fsPath);
      outputChannel.appendLine(
        `Bundled content ${imported.alreadyInstalled ? "ready" : "installed"}: ${imported.activityId}@${imported.version}`
      );
    } catch (error) {
      // One bad package must be visible, but must not hide the rest of the local catalog.
      outputChannel.appendLine(
        `Bundled content failed (${packageName}): ${formatEngineError(error)}`
      );
    }
  }
}

async function migrateOrPublishActiveExerciseContext(
  engineClient: LumenEngineClient,
  outputChannel: vscode.OutputChannel
) {
  try {
    let active = await engineClient.getActiveExercise();
    if (
      active.status === "ready" &&
      path.resolve(active.active.workspacePath) === path.resolve(active.active.installPath)
    ) {
      const migrated = await engineClient.activateExercise(
        active.active.exerciseId,
        active.active.routeId ? "route" : "free",
        path.join(os.homedir(), ".lumen")
      );
      active = { status: "ready", active: migrated.active };
      outputChannel.appendLine(`Migrated legacy active exercise to ${migrated.active.workspacePath}`);
    }
    await vscode.commands.executeCommand("setContext", "lumen.hasActiveExercise", active.status === "ready");
  } catch (error) {
    await vscode.commands.executeCommand("setContext", "lumen.hasActiveExercise", false);
    outputChannel.appendLine(`Unable to publish active exercise context: ${formatEngineError(error)}`);
  }
}

export function deactivate() {
  lumenEngineClient?.dispose();
  lumenEngineClient = undefined;
}

function formatEngineError(error: unknown) {
  if (error instanceof LumenEngineError) return `${error.code}: ${error.message}`;
  return `ENGINE_START_FAILED: ${error instanceof Error ? error.message : String(error)}`;
}

async function initializeLumenEntry(
  deps: Parameters<typeof enterLumenMode>[0],
  outputChannel: vscode.OutputChannel
) {
  await vscode.commands.executeCommand("setContext", "lumen.inMode", false);

  // Una sesion anterior pudo morir dentro de Lumen Mode (reload/crash) dejando
  // los overrides de layout aplicados. Se restauran antes de retomar la entrada.
  try {
    const restored = await cleanupStaleLumenLayout(deps.context);
    if (restored) {
      outputChannel.appendLine("Restored layout settings from a previous Lumen Mode session.");
    }
  } catch (error) {
    outputChannel.appendLine(`Failed to restore stale Lumen layout: ${String(error)}`);
  }

  try {
    if (await resumePendingLumenOpen(deps)) return;
  } catch (error) {
    outputChannel.appendLine(`Failed to resume pending Lumen entry: ${String(error)}`);
    await vscode.window.showErrorMessage(
      "Lumen cambió de workspace, pero no pudo completar la entrada automática. Intenta abrir Lumen nuevamente."
    );
    return;
  }

  if (!(await shouldAutoOpenForPerformanceHarness().catch(() => false))) return;
  setTimeout(() => {
    enterLumenMode(deps).then(undefined, (error) => {
      console.error("Failed to auto-open Lumen for performance harness", error);
    });
  }, 250);
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
