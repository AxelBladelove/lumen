import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as vscode from "vscode";
import {
  LumenEngineError,
  lumenEngineErrorCodes,
  lumenEngineProtocolVersion,
  type LumenActiveExerciseResult,
  type LumenEngineErrorDetail,
  type LumenEngineHealthCheckResult,
  type LumenEngineMethod,
  type LumenEngineMethodMap,
  type LumenEngineRequest,
  type LumenEngineResponse,
  type LumenExerciseImportResult,
  type LumenModuleSnapshotResult
} from "./lumenEngineProtocol";

const lumenEngineRequestTimeoutMs = 10_000;
const lumenEngineRestartCooldownMs = 2_000;
const lumenEngineShutdownTimeoutMs = 2_000;

export type LumenEngineRequestOptions = {
  timeoutMs?: number;
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: LumenEngineError) => void;
  timeout: NodeJS.Timeout;
};

export class LumenEngineClient implements vscode.Disposable {
  private engineProcess: ChildProcessWithoutNullStreams | undefined;
  private startPromise: Promise<ChildProcessWithoutNullStreams> | undefined;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private requestSequence = 0;
  private lastProcessFailureAt = 0;
  private disposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async request<M extends LumenEngineMethod>(
    method: M,
    params: LumenEngineMethodMap[M]["params"],
    options: LumenEngineRequestOptions = {}
  ): Promise<LumenEngineMethodMap[M]["result"]> {
    const engineProcess = await this.getOrStartEngine();
    const id = `r-${Date.now().toString(36)}-${++this.requestSequence}`;
    const request: LumenEngineRequest<M> = { id, method, params };
    const timeoutMs =
      typeof options.timeoutMs === "number" && options.timeoutMs > 0
        ? options.timeoutMs
        : lumenEngineRequestTimeoutMs;

    return new Promise<LumenEngineMethodMap[M]["result"]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new LumenEngineError(
            "ENGINE_TIMEOUT",
            `The engine did not respond to ${method} within ${timeoutMs / 1_000} seconds.`,
            true
          )
        );
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (result) => resolve(result as LumenEngineMethodMap[M]["result"]),
        reject,
        timeout
      });

      try {
        engineProcess.stdin.write(`${JSON.stringify(request)}\n`, "utf8", (error) => {
          if (!error) return;
          this.rejectPendingRequest(
            id,
            new LumenEngineError(
              "ENGINE_START_FAILED",
              `Unable to write ${method} to the engine: ${error.message}`,
              true
            )
          );
        });
      } catch (error) {
        this.rejectPendingRequest(
          id,
          new LumenEngineError(
            "ENGINE_START_FAILED",
            `Unable to write ${method} to the engine: ${formatError(error)}`,
            true
          )
        );
      }
    });
  }

  async healthCheck(): Promise<LumenEngineHealthCheckResult> {
    const result = await this.request("engine.healthCheck", {});

    if (!isHealthCheckResult(result)) {
      throw new LumenEngineError(
        "ENGINE_PROTOCOL_ERROR",
        "The engine returned an invalid engine.healthCheck result.",
        false
      );
    }

    if (result.protocolVersion !== lumenEngineProtocolVersion) {
      throw new LumenEngineError(
        "ENGINE_PROTOCOL_ERROR",
        `Engine protocol version mismatch: expected ${lumenEngineProtocolVersion}, received ${result.protocolVersion}.`,
        false
      );
    }

    return result;
  }

  async importExercise(esexPath: string): Promise<LumenExerciseImportResult> {
    return this.request("exercise.import", { esexPath });
  }

  async getActiveExercise(): Promise<LumenActiveExerciseResult> {
    return this.request("exercise.getActive", {});
  }

  async getModuleSnapshot(routeId: string, moduleId: string): Promise<LumenModuleSnapshotResult> {
    return this.request("route.getModuleSnapshot", { routeId, moduleId });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.rejectAllPending(
      new LumenEngineError("ENGINE_START_FAILED", "The Lumen engine client was disposed.", false)
    );

    const engineProcess = this.engineProcess;
    this.engineProcess = undefined;
    if (!engineProcess || engineProcess.exitCode !== null) return;

    engineProcess.stdin.end();
    const shutdownTimer = setTimeout(() => {
      if (engineProcess.exitCode === null) engineProcess.kill();
    }, lumenEngineShutdownTimeoutMs);
    shutdownTimer.unref();
    engineProcess.once("close", () => clearTimeout(shutdownTimer));
  }

  private async getOrStartEngine() {
    if (this.disposed) {
      throw new LumenEngineError("ENGINE_START_FAILED", "The Lumen engine client is disposed.", false);
    }

    if (this.engineProcess && this.engineProcess.exitCode === null && !this.engineProcess.killed) {
      return this.engineProcess;
    }

    if (this.startPromise) return this.startPromise;

    const timeSinceFailure = Date.now() - this.lastProcessFailureAt;
    if (timeSinceFailure < lumenEngineRestartCooldownMs) {
      throw new LumenEngineError(
        "ENGINE_START_FAILED",
        `The engine stopped recently. Retry in ${Math.ceil(
          (lumenEngineRestartCooldownMs - timeSinceFailure) / 1_000
        )} second(s).`,
        true
      );
    }

    const startPromise = this.startEngine();
    this.startPromise = startPromise;
    try {
      const engineProcess = await startPromise;
      if (this.disposed) {
        throw new LumenEngineError("ENGINE_START_FAILED", "The Lumen engine client is disposed.", false);
      }
      return engineProcess;
    } finally {
      if (this.startPromise === startPromise) this.startPromise = undefined;
    }
  }

  private async startEngine(): Promise<ChildProcessWithoutNullStreams> {
    const executable = await this.resolveEngineExecutable();
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    } catch (error) {
      throw new LumenEngineError(
        "ENGINE_START_FAILED",
        `Unable to create the engine data directory: ${formatError(error)}`,
        true
      );
    }

    if (this.disposed) {
      throw new LumenEngineError("ENGINE_START_FAILED", "The Lumen engine client is disposed.", false);
    }

    return new Promise((resolve, reject) => {
      let engineProcess: ChildProcessWithoutNullStreams;
      try {
        engineProcess = spawn(executable.fsPath, ["--data-dir", this.context.globalStorageUri.fsPath], {
          cwd: this.context.extensionUri.fsPath,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true
        });
      } catch (error) {
        this.lastProcessFailureAt = Date.now();
        reject(
          new LumenEngineError(
            "ENGINE_START_FAILED",
            `Unable to start the engine: ${formatError(error)}`,
            true
          )
        );
        return;
      }
      this.engineProcess = engineProcess;

      let stdoutBuffer = "";
      let stderrBuffer = "";
      let started = false;
      let terminated = false;

      engineProcess.stdout.setEncoding("utf8");
      engineProcess.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        stdoutBuffer = this.consumeLines(stdoutBuffer, (line) => this.handleResponseLine(line));
      });

      engineProcess.stderr.setEncoding("utf8");
      engineProcess.stderr.on("data", (chunk: string) => {
        stderrBuffer += chunk;
        stderrBuffer = this.consumeLines(stderrBuffer, (line) => {
          this.outputChannel.appendLine(`[Engine] ${line}`);
        });
      });

      const terminate = (message: string) => {
        if (terminated) return;
        terminated = true;
        if (stderrBuffer.trim()) this.outputChannel.appendLine(`[Engine] ${stderrBuffer.trimEnd()}`);
        if (this.engineProcess === engineProcess) this.engineProcess = undefined;

        if (!this.disposed) {
          this.lastProcessFailureAt = Date.now();
          const error = new LumenEngineError("ENGINE_START_FAILED", message, true);
          this.rejectAllPending(error);
          this.outputChannel.appendLine(`Engine stopped: ${message}`);
          if (!started) reject(error);
        }
      };

      engineProcess.stdin.on("error", (error) => {
        terminate(`The engine input stream failed: ${error.message}`);
      });

      engineProcess.once("spawn", () => {
        started = true;
        this.outputChannel.appendLine(`Engine started: ${executable.fsPath}`);
        resolve(engineProcess);
      });
      engineProcess.once("error", (error) => {
        terminate(`Unable to start the engine: ${error.message}`);
      });
      engineProcess.once("close", (code, signal) => {
        terminate(
          `The engine process exited${code === null ? "" : ` with code ${code}`}${
            signal === null ? "" : ` (signal ${signal})`
          }.`
        );
      });
    });
  }

  private async resolveEngineExecutable() {
    const executableName = process.platform === "win32" ? "lumen-engine.exe" : "lumen-engine";
    const candidates = [
      vscode.Uri.joinPath(this.context.extensionUri, "bin", executableName),
      vscode.Uri.joinPath(this.context.extensionUri, "engine", "target", "release", executableName),
      vscode.Uri.joinPath(this.context.extensionUri, "engine", "target", "debug", executableName)
    ];

    for (const candidate of candidates) {
      try {
        const stat = await vscode.workspace.fs.stat(candidate);
        if ((stat.type & vscode.FileType.File) !== 0) return candidate;
      } catch {}
    }

    throw new LumenEngineError(
      "ENGINE_NOT_FOUND",
      `Lumen Engine was not found. Looked in: ${candidates.map((candidate) => candidate.fsPath).join(", ")}.`,
      true
    );
  }

  private consumeLines(buffer: string, consume: (line: string) => void) {
    let lineBreak = buffer.indexOf("\n");
    while (lineBreak >= 0) {
      const line = buffer.slice(0, lineBreak).replace(/\r$/, "");
      buffer = buffer.slice(lineBreak + 1);
      if (line.trim()) consume(line);
      lineBreak = buffer.indexOf("\n");
    }
    return buffer;
  }

  private handleResponseLine(line: string) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      this.handleProtocolError(
        line,
        `Invalid JSON from the engine: ${formatError(error)}`,
        malformedResponseId(line)
      );
      return;
    }

    if (!isLumenEngineResponse(value)) {
      this.handleProtocolError(line, "The engine emitted a response with an invalid shape.", responseId(value));
      return;
    }

    if (value.id === null) {
      if ("error" in value) {
        this.outputChannel.appendLine(
          `Engine protocol response without a request id: ${value.error.code}: ${value.error.message}`
        );
      }
      return;
    }

    const pending = this.pendingRequests.get(value.id);
    if (!pending) {
      this.outputChannel.appendLine(`Engine response for unknown or expired request id: ${value.id}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(value.id);
    if (value.ok) {
      pending.resolve(value.result);
      return;
    }

    pending.reject(
      new LumenEngineError(value.error.code, value.error.message, value.error.recoverable, value.error.details)
    );
  }

  private handleProtocolError(line: string, message: string, attributedId?: string) {
    this.outputChannel.appendLine(`${message} Line: ${line}`);
    const requestId =
      (attributedId && this.pendingRequests.has(attributedId) ? attributedId : undefined) ??
      (this.pendingRequests.size === 1 ? this.pendingRequests.keys().next().value : undefined);
    if (typeof requestId !== "string") return;

    this.rejectPendingRequest(
      requestId,
      new LumenEngineError("ENGINE_PROTOCOL_ERROR", `${message} Request: ${requestId}.`, false)
    );
  }

  private rejectPendingRequest(id: string, error: LumenEngineError) {
    const pending = this.pendingRequests.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    pending.reject(error);
  }

  private rejectAllPending(error: LumenEngineError) {
    for (const [id] of this.pendingRequests) this.rejectPendingRequest(id, error);
  }
}

function isLumenEngineResponse(value: unknown): value is LumenEngineResponse {
  if (!isRecord(value) || (typeof value.id !== "string" && value.id !== null)) return false;
  if (value.ok === true) return typeof value.id === "string" && "result" in value;
  if (value.ok !== false || !isRecord(value.error)) return false;

  if (
    typeof value.error.code !== "string" ||
    !(lumenEngineErrorCodes as readonly string[]).includes(value.error.code) ||
    typeof value.error.message !== "string" ||
    typeof value.error.recoverable !== "boolean"
  ) {
    return false;
  }

  if (value.error.details === undefined) return true;
  return isErrorDetailArray(value.error.details);
}

function isErrorDetailArray(value: unknown): value is LumenEngineErrorDetail[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.code === "string" &&
      typeof entry.path === "string" &&
      typeof entry.message === "string"
  );
}

function isHealthCheckResult(value: unknown): value is LumenEngineHealthCheckResult {
  if (!isRecord(value)) return false;
  if (
    typeof value.protocolVersion !== "number" ||
    typeof value.engineVersion !== "string" ||
    (value.dbStatus !== "ready" && value.dbStatus !== "error") ||
    typeof value.dbPath !== "string"
  ) {
    return false;
  }

  return value.dbStatus !== "error" || typeof value.dbError === "string";
}

function responseId(value: unknown) {
  return isRecord(value) && typeof value.id === "string" ? value.id : undefined;
}

function malformedResponseId(line: string) {
  return /"id"\s*:\s*"([^"]+)"/.exec(line)?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
