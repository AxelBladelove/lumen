import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { lumenWebviewProtocolVersion, type LumenEntryState } from "./lumenProtocol";
import { getLumenFrontendHtml, getLumenFrontendResourceRoots } from "./lumenWebviewContent";

type LumenModePhase = "idle" | "entering" | "active";

type LumenWebviewMessage =
  | {
      type: "frontend.ready";
      payload: {
        protocolVersion: number;
        view: "route-path-view";
        routeId: string;
        moduleId: string;
        dataSource: string;
      };
    }
  | {
      type: "route.node.selected";
      payload: {
        nodeId: string;
        status: string;
        nodeType: string;
      };
    }
  | {
      type: "route.continue.requested";
      payload: {
        fromNodeId?: string;
        nextNodeId?: string;
      };
    }
  | {
      type: "lumen.exit.requested";
      payload: Record<string, never>;
    }
  | {
      type: "perf.report";
      payload: {
        label: string;
        navigation: {
          domContentLoadedMs: number | null;
          loadMs: number | null;
        };
        marks: Record<string, number>;
        measures?: Record<string, number>;
        frameStats?: {
          frames: number;
          avgFrameMs: number | null;
          p95FrameMs: number | null;
          maxFrameMs: number | null;
          overBudgetFrames: number;
        };
        webglStats?: Record<string, unknown> | null;
        routePresent: boolean;
        canvasPresent: boolean;
        nodeCount: number;
        visibilityState: string;
        hasFocus: boolean;
      };
    };

/**
 * Vista principal de Lumen en el Activity Bar. Renderiza el frontend completo
 * dentro del sidebar (la UI de Lumen ES la vista de la extension). Al hacerse
 * visible por un gesto del usuario dispara `lumen.enterMode`, que aplica el
 * layout enfocado y mueve el sidebar a la derecha. VS Code persiste de forma
 * nativa el ancho del sidebar entre sesiones.
 */
export class LumenRoutePathViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "lumen.routePath";

  private view: vscode.WebviewView | undefined;
  private phase: LumenModePhase = "idle";
  private entryState: LumenEntryState | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly onLaunchRequested: () => void
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.title = " ";
    webviewView.description = "";

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: getLumenFrontendResourceRoots(this.context)
    };

    webviewView.webview.onDidReceiveMessage(
      (message: LumenWebviewMessage) => this.handleWebviewMessage(message),
      undefined,
      this.context.subscriptions
    );

    webviewView.onDidChangeVisibility(
      () => {
        if (webviewView.visible) this.maybeAutoEnter();
      },
      undefined,
      this.context.subscriptions
    );

    webviewView.webview.html = await getLumenFrontendHtml(this.context, webviewView.webview);
    this.maybeAutoEnter();
  }

  setPhase(phase: LumenModePhase) {
    this.phase = phase;
    this.postPhase();
  }

  async reveal() {
    await vscode.commands
      .executeCommand(`${LumenRoutePathViewProvider.viewType}.focus`)
      .then(undefined, () => undefined);
  }

  async refresh() {
    if (!this.view) return false;
    this.view.webview.html = await getLumenFrontendHtml(this.context, this.view.webview);
    return true;
  }

  setEntryState(entryState: LumenEntryState) {
    this.entryState = entryState;
    this.postEntryState();
  }

  private maybeAutoEnter() {
    if (this.phase !== "idle") return;
    // El click en el icono hace que VS Code abra el sidebar por su cuenta.
    // Cerrarlo se despacha sincronicamente en este mismo turno (antes de
    // cualquier otro trabajo de la entrada) para que, como mucho, llegue a
    // pintarse un solo frame antes de la cortina de carga.
    void vscode.commands.executeCommand("workbench.action.closeSidebar");
    this.onLaunchRequested();
  }

  private postEntryState() {
    if (!this.entryState) return;
    this.postToWebview({
      type: "lumen.entry.state",
      payload: this.entryState
    });
  }

  private postPhase() {
    if (this.phase === "idle") return;
    this.postToWebview({
      type: "lumen.entry.transition",
      payload: {
        phase: this.phase
      }
    });
  }

  private handleWebviewMessage(message: LumenWebviewMessage) {
    if (!message || typeof message.type !== "string") return;

    switch (message.type) {
      case "frontend.ready":
        this.outputChannel.appendLine(
          `Frontend ready: ${message.payload.view} (${message.payload.dataSource}, ${message.payload.moduleId})`
        );
        this.postToWebview({
          type: "extension.ready",
          payload: {
            protocolVersion: lumenWebviewProtocolVersion,
            mode: "mock",
            message: "Lumen Extension Host connected."
          }
        });
        this.postEntryState();
        this.postPhase();
        break;

      case "route.node.selected":
        this.outputChannel.appendLine(
          `Route node selected: ${message.payload.nodeId} (${message.payload.status}, ${message.payload.nodeType})`
        );
        break;

      case "route.continue.requested":
        this.outputChannel.appendLine(
          `Route continue requested: ${message.payload.fromNodeId ?? "none"} -> ${
            message.payload.nextNodeId ?? "none"
          }`
        );
        break;

      case "lumen.exit.requested":
        void vscode.commands.executeCommand("lumen.exitMode");
        break;

      case "perf.report":
        void this.writePerfReport(message.payload);
        break;
    }
  }

  private async writePerfReport(payload: Extract<LumenWebviewMessage, { type: "perf.report" }>["payload"]) {
    const perfDirectory = vscode.Uri.joinPath(this.context.extensionUri, ".lumen-perf");
    const perfFile = vscode.Uri.joinPath(perfDirectory, "vscode-webview.jsonl");
    const report = {
      capturedAt: new Date().toISOString(),
      viewType: LumenRoutePathViewProvider.viewType,
      ...payload
    };

    try {
      await fs.mkdir(perfDirectory.fsPath, { recursive: true });
      await fs.appendFile(perfFile.fsPath, `${JSON.stringify(report)}\n`, "utf8");
      if (payload.label === "steady-frame-sample") {
        this.outputChannel.appendLine(
          `Perf steady-frame-sample: load=${payload.navigation.loadMs ?? "n/a"}ms, p95=${
            payload.frameStats?.p95FrameMs ?? "n/a"
          }ms, webgl=${formatNumber(payload.webglStats?.lastRenderMs)}ms`
        );
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `Unable to write perf report: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private postToWebview(message: unknown) {
    this.view?.webview.postMessage(message);
  }
}

function formatNumber(value: unknown) {
  return typeof value === "number" ? Math.round(value * 10) / 10 : "n/a";
}
