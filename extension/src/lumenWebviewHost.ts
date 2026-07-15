import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import type { LumenEngineClient } from "./engine/lumenEngineClient";
import {
  LumenEngineError,
  type LumenActiveExerciseDescriptor,
  type LumenExerciseMode,
  type LumenModuleSnapshotNode
} from "./engine/lumenEngineProtocol";
import {
  lumenWebviewProtocolVersion,
  type ExerciseDetailPayload,
  type LumenEntryState,
  type LumenExerciseDetailDataMessage,
  type LumenExerciseDetailRequestedMessage
} from "./lumenProtocol";

export type LumenModePhase = "idle" | "entering" | "active";

export type LumenWebviewMessage =
  | LumenExerciseDetailRequestedMessage
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
      type: "frontend.layoutHandoffReady";
      payload: {
        delayMs: number;
        token: string;
      };
    }
  | {
      type: "frontend.layoutCommitArmed";
      payload: {
        token: string;
      };
    }
  | {
      type: "frontend.layoutHandoffPrepared";
      payload: {
        token: string;
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

type LumenWebviewHostOptions = {
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
  engineClient: LumenEngineClient;
  onExitRequested: () => void;
  /** El frontend evaluó su bundle y conectó el protocolo. */
  onFrontendReady?: () => void;
  /**
   * El punch-in acaba de arrancar y el frontend ya habilitó el commit.
   * El Extension Host conserva el reloj del handoff para que el throttling del
   * iframe no pueda convertir el tramo óptico en una pausa de un segundo.
   */
  onFrontendLayoutHandoffReady?: (delayMs: number, token: string) => void;
  /** El frontend aceptó el token que gobernará este único ciclo de entrada. */
  onFrontendLayoutCommitArmed?: (token: string) => void;
  /** La UI sin intro atravesó una pintura y ya es segura para mover el panel. */
  onFrontendLayoutHandoffPrepared?: (token: string) => void;
  /** El intro terminó: la ruta está pintada y no quedan módulos en vuelo. */
  onFrontendRevealed?: () => void;
  perfViewType: string;
};

export class LumenWebviewHost {
  private webview: vscode.Webview | undefined;
  private phase: LumenModePhase = "idle";
  private entryState: LumenEntryState | undefined;
  private currentRouteId = "c";
  private currentModuleId = "strings";
  private activationInFlight = false;
  private exerciseDetailRequestSequence = 0;

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

  /** Prearma el ciclo visual; todavía no autoriza retirar la cortina. */
  postLayoutCommitRequested(token: string) {
    this.postToWebview({ type: "lumen.layoutCommitRequested", payload: { token } });
  }

  /** Pide pintar una superficie segura antes de tocar el layout de VS Code. */
  postLayoutHandoffPrepare(token: string) {
    this.postToWebview({ type: "lumen.layoutHandoffPrepare", payload: { token } });
  }

  /** Confirma que los comandos de layout terminaron y autoriza el landing. */
  postLayoutCommitted(token: string) {
    this.postToWebview({ type: "lumen.layoutCommitted", payload: { token } });
  }

  async postExerciseCompleted(exerciseId: string) {
    if (!this.webview) return;

    this.postToWebview({
      type: "route.exercise.completed",
      payload: { nodeId: exerciseId }
    });
    await this.pushRouteModuleData(this.currentRouteId, this.currentModuleId);
  }

  /**
   * Punto autoritativo de activación desde el Extension Host: en Lumen Mode el
   * engine decide qué ejercicio está activo y dónde vive su workspace; aquí sólo
   * traducimos la selección del usuario a `exercise.activate` y proyectamos el
   * resultado (abrir entrypoint + refrescar snapshot). Toda la UI depende de
   * este ciclo — no hay avance inventado en el frontend.
   */
  async activateAndOpenExercise(
    exerciseId: string,
    mode: LumenExerciseMode = "route"
  ): Promise<LumenActiveExerciseDescriptor | undefined> {
    if (this.activationInFlight) {
      this.options.outputChannel.appendLine(
        `Activation requested for ${exerciseId} while another activation is in flight; ignoring.`
      );
      return undefined;
    }

    const workspaceRoot = this.entryState?.workspace.officialWorkspacePath;
    if (!workspaceRoot) {
      this.options.outputChannel.appendLine(
        `Cannot activate ${exerciseId}: official Lumen workspace path is not known yet.`
      );
      return undefined;
    }

    this.activationInFlight = true;
    this.postActivationState({ busy: { exerciseId }, error: null });

    try {
      const result = await this.options.engineClient.activateExercise(
        exerciseId,
        mode,
        workspaceRoot
      );
      this.options.outputChannel.appendLine(
        `Exercise activated (${result.created ? "created" : "reused"}): ${result.active.exerciseId} @ ${result.active.workspacePath}`
      );
      await this.openEntrypoint(result.active.entrypointPath);
      await vscode.commands.executeCommand("setContext", "lumen.hasActiveExercise", true);
      await this.pushRouteModuleData(this.currentRouteId, this.currentModuleId);
      this.postActivationState({ busy: null, error: null });
      return result.active;
    } catch (error) {
      const message = formatActivationError(error);
      this.options.outputChannel.appendLine(
        `Exercise activation failed for ${exerciseId}: ${message}`
      );
      this.postActivationState({ busy: null, error: { exerciseId, message } });
      void vscode.window.showErrorMessage(`Lumen: no se pudo activar el ejercicio. ${message}`);
      return undefined;
    } finally {
      this.activationInFlight = false;
    }
  }

  /**
   * "Continuar" no confía en un id del frontend: consulta el snapshot y activa
   * el primer nodo con estado `active`. Si no hay ninguno (módulo completado o
   * vacío), no hace nada.
   */
  async activateRecommendedExercise(): Promise<LumenActiveExerciseDescriptor | undefined> {
    let recommendedExerciseId: string | undefined;

    try {
      const { snapshot } = await this.options.engineClient.getModuleSnapshot(
        this.currentRouteId,
        this.currentModuleId
      );
      recommendedExerciseId =
        snapshot.activeExerciseId ??
        snapshot.nodes.find((node) => node.status === "active")?.exerciseId;
    } catch (error) {
      const message = formatActivationError(error);
      this.options.outputChannel.appendLine(
        `Unable to look up recommended exercise: ${message}`
      );
      void vscode.window.showErrorMessage(
        `Lumen: no se pudo obtener el ejercicio recomendado. ${message}`
      );
      return undefined;
    }

    if (!recommendedExerciseId) {
      this.options.outputChannel.appendLine(
        `No active exercise in ${this.currentRouteId}/${this.currentModuleId} to continue.`
      );
      return undefined;
    }

    return this.activateAndOpenExercise(recommendedExerciseId);
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

  // Consulta el snapshot del modulo al engine y lo proyecta a la webview. Solo
  // se envia cuando hay nodos reales: con lista vacia la webview conserva el
  // mock (contrato v3, "Puente webview").
  private async pushRouteModuleData(routeId: string, moduleId: string) {
    let snapshotNodes: LumenModuleSnapshotNode[];
    let activeExerciseId: string | null;
    let resolvedRouteId: string;
    let resolvedModuleId: string;

    try {
      const { snapshot } = await this.options.engineClient.getModuleSnapshot(routeId, moduleId);
      snapshotNodes = snapshot.nodes;
      activeExerciseId = snapshot.activeExerciseId;
      resolvedRouteId = snapshot.routeId;
      resolvedModuleId = snapshot.moduleId;
    } catch (error) {
      this.options.outputChannel.appendLine(
        `route.getModuleSnapshot(${routeId}/${moduleId}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return;
    }

    if (snapshotNodes.length === 0) return;

    this.currentRouteId = resolvedRouteId;
    this.currentModuleId = resolvedModuleId;

    this.postToWebview({
      type: "route.module.data",
      payload: {
        source: "engine",
        routeId: resolvedRouteId,
        moduleId: resolvedModuleId,
        activeExerciseId,
        nodes: snapshotNodes
      }
    });
    await this.pushExerciseDetail(activeExerciseId);
  }

  private async pushExerciseDetail(exerciseId: string | null) {
    const requestSequence = ++this.exerciseDetailRequestSequence;
    let detail: ExerciseDetailPayload | null = null;

    if (exerciseId) {
      try {
        ({ detail } = await this.options.engineClient.getExerciseDetail(exerciseId));
      } catch (error) {
        this.options.outputChannel.appendLine(
          `exercise.getDetail(${exerciseId}) failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (requestSequence !== this.exerciseDetailRequestSequence) return;
    const message: LumenExerciseDetailDataMessage = {
      type: "exercise.detail.data",
      payload: { source: "engine", detail }
    };
    this.postToWebview(message);
  }

  private postActivationState(state: {
    busy: { exerciseId: string } | null;
    error: { exerciseId?: string; message: string } | null;
  }) {
    this.postToWebview({
      type: "route.activation.state",
      payload: state
    });
  }

  private async openEntrypoint(entrypointPath: string) {
    try {
      const uri = vscode.Uri.file(entrypointPath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
        preview: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.outputChannel.appendLine(
        `Unable to open exercise entrypoint ${entrypointPath}: ${message}`
      );
      void vscode.window.showErrorMessage(
        `Lumen: no se pudo abrir el ejercicio (${entrypointPath}). ${message}`
      );
    }
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
        void this.pushRouteModuleData(this.currentRouteId, this.currentModuleId);
        break;

      case "frontend.layoutHandoffReady":
        this.options.onFrontendLayoutHandoffReady?.(message.payload.delayMs, message.payload.token);
        break;

      case "frontend.layoutCommitArmed":
        this.options.onFrontendLayoutCommitArmed?.(message.payload.token);
        break;

      case "frontend.layoutHandoffPrepared":
        this.options.onFrontendLayoutHandoffPrepared?.(message.payload.token);
        break;

      case "frontend.revealed":
        this.options.onFrontendRevealed?.();
        break;

      case "route.node.selected":
        this.options.outputChannel.appendLine(
          `Route node selected: ${message.payload.nodeId} (${message.payload.status}, ${message.payload.nodeType})`
        );
        // Un nodo locked no abre: la ruta impone el orden, no la vista.
        if (message.payload.status === "active" || message.payload.status === "completed") {
          void this.activateAndOpenExercise(message.payload.nodeId);
        }
        break;

      case "route.continue.requested":
        this.options.outputChannel.appendLine(
          `Route continue requested: ${message.payload.fromNodeId ?? "none"} -> ${
            message.payload.nextNodeId ?? "none"
          }`
        );
        void this.activateRecommendedExercise();
        break;

      case "exercise.detail.requested":
        void this.pushExerciseDetail(message.payload.exerciseId);
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

function formatActivationError(error: unknown): string {
  if (error instanceof LumenEngineError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
