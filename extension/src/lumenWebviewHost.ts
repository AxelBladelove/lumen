import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { lumenWebviewProtocolVersion, type LumenEntryState } from "./lumenProtocol";

export type LumenModePhase = "idle" | "entering" | "active";

export type LumenWebviewMessage =
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
      type: "frontend.revealed";
      payload: Record<string, never>;
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

type LumenWebviewHostOptions = {
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
  onExitRequested: () => void;
  /** El frontend evaluó su bundle y conectó el protocolo. */
  onFrontendReady?: () => void;
  /** El intro terminó: la ruta está pintada y no quedan módulos en vuelo. */
  onFrontendRevealed?: () => void;
  perfViewType: string;
};

export class LumenWebviewHost {
  private webview: vscode.Webview | undefined;
  private phase: LumenModePhase = "idle";
  private entryState: LumenEntryState | undefined;

  constructor(private readonly options: LumenWebviewHostOptions) {}

  bindWebview(webview: vscode.Webview, disposables: vscode.Disposable[]) {
    this.webview = webview;
    disposables.push(
      webview.onDidReceiveMessage((message: LumenWebviewMessage) => this.handleWebviewMessage(message))
    );
    this.postEntryState();
    this.postPhase();
  }

  unbindWebview(webview: vscode.Webview) {
    if (this.webview === webview) this.webview = undefined;
  }

  setPhase(phase: LumenModePhase) {
    this.phase = phase;
    this.postPhase();
  }

  setEntryState(entryState: LumenEntryState) {
    this.entryState = entryState;
    this.postEntryState();
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
        this.options.outputChannel.appendLine(
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
        this.options.onFrontendReady?.();
        break;

      case "frontend.revealed":
        this.options.onFrontendRevealed?.();
        break;

      case "route.node.selected":
        this.options.outputChannel.appendLine(
          `Route node selected: ${message.payload.nodeId} (${message.payload.status}, ${message.payload.nodeType})`
        );
        break;

      case "route.continue.requested":
        this.options.outputChannel.appendLine(
          `Route continue requested: ${message.payload.fromNodeId ?? "none"} -> ${
            message.payload.nextNodeId ?? "none"
          }`
        );
        break;

      case "lumen.exit.requested":
        this.options.onExitRequested();
        break;

      case "perf.report":
        void this.writePerfReport(message.payload);
        break;
    }
  }

  private async writePerfReport(payload: Extract<LumenWebviewMessage, { type: "perf.report" }>["payload"]) {
    const perfDirectory = vscode.Uri.joinPath(this.options.context.extensionUri, ".lumen-perf");
    const perfFile = vscode.Uri.joinPath(perfDirectory, "vscode-webview.jsonl");
    const report = {
      capturedAt: new Date().toISOString(),
      viewType: this.options.perfViewType,
      ...payload
    };

    try {
      await fs.mkdir(perfDirectory.fsPath, { recursive: true });
      await fs.appendFile(perfFile.fsPath, `${JSON.stringify(report)}\n`, "utf8");
      if (payload.label === "steady-frame-sample") {
        this.options.outputChannel.appendLine(
          `Perf steady-frame-sample: load=${payload.navigation.loadMs ?? "n/a"}ms, p95=${
            payload.frameStats?.p95FrameMs ?? "n/a"
          }ms, webgl=${formatNumber(payload.webglStats?.lastRenderMs)}ms`
        );
      }
    } catch (error) {
      this.options.outputChannel.appendLine(
        `Unable to write perf report: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private postToWebview(message: unknown) {
    void this.webview?.postMessage(message);
  }
}

function formatNumber(value: unknown) {
  return typeof value === "number" ? Math.round(value * 10) / 10 : "n/a";
}
