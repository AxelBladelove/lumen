import * as path from "node:path";
import * as vscode from "vscode";
import type { LumenEngineClient } from "./engine/lumenEngineClient";
import {
  LumenEngineError,
  type LumenCompileDiagnostic,
  type LumenCompileResult
} from "./engine/lumenEngineProtocol";
import { isLumenModeActive } from "./lumenEntry";
import {
  acquireExternalRunReservation,
  launchProgram,
  type ExternalRunReservation
} from "./lumenExternalConsole";
import { resolveActiveEntrypoint, saveEntrypointIfDirty } from "./lumenExercise";

const compileRequestTimeoutMs = 60_000;
const compileTerminalName = "Lumen Compile";

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  blue: "\x1b[94m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m"
} as const;

export class LumenCompileController implements vscode.Disposable {
  private terminal: vscode.Terminal | undefined;
  private pty: LumenCompilePty | undefined;
  private compileInFlight = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly engineClient: LumenEngineClient,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly runnerPath: string
  ) {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this.terminal) {
          this.terminal = undefined;
          this.pty = undefined;
        }
      })
    );
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.terminal?.dispose();
    this.terminal = undefined;
    this.pty = undefined;
  }

  async compileCurrentExercise(): Promise<void> {
    if (!isLumenModeActive()) {
      void vscode.window.showInformationMessage(
        "Lumen: F9 solo compila dentro de Lumen Mode. Abre Lumen y selecciona un ejercicio."
      );
      return;
    }

    if (this.compileInFlight) {
      this.outputChannel.appendLine("Compile requested while another compile is in flight; ignoring.");
      return;
    }

    const sourcePath = await this.resolveActiveEntrypointForCompile();
    if (!sourcePath) return;
    const reservation = acquireExternalRunReservation();
    if (!reservation) {
      void vscode.window.showWarningMessage(
        "Ya hay una ventana externa de Lumen abierta. Ciérrala antes de compilar de nuevo."
      );
      return;
    }

    this.compileInFlight = true;
    let handedOff = false;
    try {
      let result: LumenCompileResult;
      try {
        result = await this.engineClient.request(
          "exercise.compile",
          { sourcePath },
          { timeoutMs: compileRequestTimeoutMs }
        );
      } catch (error) {
        await this.handleCompileError(error, sourcePath);
        return;
      }

      if (result.status === "success") {
        handedOff = await this.presentSuccess(result, sourcePath, reservation);
      } else {
        this.presentCompileError(result, sourcePath);
      }
    } finally {
      if (!handedOff) reservation.release();
      this.compileInFlight = false;
    }
  }

  private async resolveActiveEntrypointForCompile(): Promise<string | undefined> {
    const entrypoint = await resolveActiveEntrypoint(this.engineClient, this.outputChannel);
    if (!entrypoint) return undefined;

    const saved = await saveEntrypointIfDirty(entrypoint);
    if (!saved) {
      await vscode.window.showErrorMessage(
        `Lumen: no se pudo guardar ${path.basename(entrypoint)} antes de compilar.`
      );
      return undefined;
    }

    return entrypoint;
  }

  private async presentSuccess(
    result: Extract<LumenCompileResult, { status: "success" }>,
    sourcePath: string,
    reservation: ExternalRunReservation
  ): Promise<boolean> {
    this.outputChannel.appendLine(
      `Compile success: ${sourcePath} -> ${result.executablePath} in ${result.durationMs}ms.`
    );

    try {
      launchProgram({
        runnerPath: this.runnerPath,
        exePath: result.executablePath,
        title: `${path.basename(result.executablePath)} - Lumen`,
        reservation
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`External console failed: ${message}`);
      await vscode.window.showErrorMessage(
        `Lumen: could not open the external console. ${message}`
      );
      return false;
    }

    const warnings = result.diagnostics.filter((d) => d.kind === "warning");
    if (warnings.length > 0) {
      this.renderDiagnosticsTerminal({
        headerLine: `Compiled ${path.basename(sourcePath)} with ${warnings.length} warning(s).`,
        sourcePath,
        diagnostics: result.diagnostics,
        errorCount: 0,
        warningCount: warnings.length,
        durationMs: result.durationMs,
        preserveFocus: true
      });
    }
    return true;
  }

  private presentCompileError(
    result: Extract<LumenCompileResult, { status: "compile_error" }>,
    sourcePath: string
  ): void {
    const errorCount = result.diagnostics.filter((d) => d.kind === "error").length;
    const warningCount = result.diagnostics.filter((d) => d.kind === "warning").length;

    this.outputChannel.appendLine(
      `Compile error: ${sourcePath} — ${errorCount} error(s), ${warningCount} warning(s) in ${result.durationMs}ms.`
    );

    this.renderDiagnosticsTerminal({
      headerLine: `Compile failed for ${path.basename(sourcePath)}.`,
      sourcePath,
      diagnostics: result.diagnostics,
      errorCount,
      warningCount,
      durationMs: result.durationMs,
      preserveFocus: false
    });
  }

  private renderDiagnosticsTerminal(options: {
    headerLine: string;
    sourcePath: string;
    diagnostics: LumenCompileDiagnostic[];
    errorCount: number;
    warningCount: number;
    durationMs: number;
    preserveFocus: boolean;
  }): void {
    const pty = this.getOrCreatePty();
    pty.clear();
    pty.writeLine(`${ansi.bold}${ansi.cyan}${options.headerLine}${ansi.reset}`);
    pty.writeLine("");

    if (options.diagnostics.length === 0) {
      pty.writeLine(`${ansi.dim}No diagnostics reported by the compiler.${ansi.reset}`);
    } else {
      for (const diagnostic of options.diagnostics) {
        pty.writeLine(formatDiagnosticLine(diagnostic, options.sourcePath));
      }
    }

    pty.writeLine("");
    pty.writeLine(
      `${ansi.dim}${options.errorCount} error(s), ${options.warningCount} warning(s) — ${options.durationMs}ms${ansi.reset}`
    );

    const terminal = this.terminal;
    if (terminal) terminal.show(options.preserveFocus);
  }

  private getOrCreatePty(): LumenCompilePty {
    if (this.terminal && this.pty) return this.pty;

    const pty = new LumenCompilePty();
    const terminal = vscode.window.createTerminal({ name: compileTerminalName, pty });
    this.terminal = terminal;
    this.pty = pty;
    return pty;
  }

  private async handleCompileError(error: unknown, sourcePath: string): Promise<void> {
    if (error instanceof LumenEngineError) {
      this.outputChannel.appendLine(
        `Compile request failed for ${sourcePath}: ${error.code}: ${error.message}`
      );

      if (error.code === "TOOLCHAIN_NOT_FOUND") {
        const hint = await this.fetchToolchainHint();
        const detail = hint ? ` ${hint}` : "";
        await vscode.window.showErrorMessage(
          `Lumen: no C compiler found.${detail} Install MSYS2 UCRT64 and make sure GCC is on the PATH.`
        );
        return;
      }

      if (error.code === "SOURCE_NOT_FOUND") {
        await vscode.window.showErrorMessage(
          `Lumen: the source file was rejected by the engine (${error.message}).`
        );
        return;
      }

      if (error.code === "BUILD_DIR_ERROR") {
        await vscode.window.showErrorMessage(
          `Lumen: could not create the .lumen-build folder next to the source. ${error.message}`
        );
        return;
      }

      if (error.code === "COMPILER_FAILED") {
        await vscode.window.showErrorMessage(
          `Lumen: the compiler could not run. ${error.message}`
        );
        return;
      }

      await vscode.window.showErrorMessage(`Lumen compile failed: ${error.code}: ${error.message}`);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`Compile request failed for ${sourcePath}: ${message}`);
    await vscode.window.showErrorMessage(`Lumen compile failed: ${message}`);
  }

  private async fetchToolchainHint(): Promise<string | undefined> {
    try {
      const status = await this.engineClient.request("toolchain.check", {});
      if (status.status === "missing" && status.hint) return status.hint;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`toolchain.check failed: ${message}`);
    }
    return undefined;
  }
}

class LumenCompilePty implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  readonly onDidWrite = this.writeEmitter.event;
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  readonly onDidClose = this.closeEmitter.event;
  private opened = false;
  private buffered = "";

  open(): void {
    this.opened = true;
    if (this.buffered.length > 0) {
      this.writeEmitter.fire(this.buffered);
      this.buffered = "";
    }
  }

  close(): void {}

  writeLine(line: string): void {
    this.emit(`${line}\r\n`);
  }

  clear(): void {
    this.emit("\x1b[2J\x1b[3J\x1b[H");
  }

  private emit(chunk: string): void {
    if (this.opened) {
      this.writeEmitter.fire(chunk);
    } else {
      this.buffered += chunk;
    }
  }
}

export function formatDiagnosticLine(
  diagnostic: LumenCompileDiagnostic,
  sourcePath: string
): string {
  const label =
    diagnostic.kind === "error"
      ? `${ansi.red}error${ansi.reset}`
      : diagnostic.kind === "warning"
      ? `${ansi.blue}warning${ansi.reset}`
      : `${ansi.dim}note${ansi.reset}`;

  const file = diagnostic.file ?? path.basename(sourcePath);
  const location =
    diagnostic.line !== null
      ? diagnostic.column !== null
        ? `${file}:${diagnostic.line}:${diagnostic.column}`
        : `${file}:${diagnostic.line}`
      : file;

  return `${location}: ${label}: ${diagnostic.message}`;
}
