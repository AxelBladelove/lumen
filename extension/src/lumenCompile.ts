import { spawn } from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";
import type { LumenEngineClient } from "./engine/lumenEngineClient";
import {
  LumenEngineError,
  type LumenCompileDiagnostic,
  type LumenCompileResult
} from "./engine/lumenEngineProtocol";

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
    private readonly outputChannel: vscode.OutputChannel
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
    if (this.compileInFlight) {
      this.outputChannel.appendLine("Compile requested while another compile is in flight; ignoring.");
      return;
    }

    const sourcePath = await this.resolveSourcePath();
    if (!sourcePath) return;

    this.compileInFlight = true;
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
        await this.presentSuccess(result, sourcePath);
      } else {
        this.presentCompileError(result, sourcePath);
      }
    } finally {
      this.compileInFlight = false;
    }
  }

  private async resolveSourcePath(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showErrorMessage(
        "Lumen: open a .c file in the editor before compiling."
      );
      return undefined;
    }

    const document = editor.document;
    const activePath = document.uri.fsPath;
    const activeIsCFile =
      document.uri.scheme === "file" && path.extname(activePath).toLowerCase() === ".c";

    let sourcePath: string | undefined;

    if (activeIsCFile) {
      sourcePath = activePath;
    } else if (document.uri.scheme === "file") {
      const folder = path.dirname(activePath);
      const candidate = path.join(folder, "main.c");
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
        if ((stat.type & vscode.FileType.File) !== 0) sourcePath = candidate;
      } catch {
        // main.c not present next to the active file — fall through to error below.
      }
    }

    if (!sourcePath) {
      await vscode.window.showErrorMessage(
        "Lumen: no compilable C file is active. Open a .c file or a folder that contains main.c."
      );
      return undefined;
    }

    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.scheme === "file" && d.uri.fsPath === sourcePath
    );
    if (openDoc?.isDirty) {
      const saved = await openDoc.save();
      if (!saved) {
        await vscode.window.showErrorMessage(
          `Lumen: could not save ${path.basename(sourcePath)} before compiling.`
        );
        return undefined;
      }
    }

    return sourcePath;
  }

  private async presentSuccess(
    result: Extract<LumenCompileResult, { status: "success" }>,
    sourcePath: string
  ): Promise<void> {
    this.outputChannel.appendLine(
      `Compile success: ${sourcePath} -> ${result.executablePath} in ${result.durationMs}ms.`
    );

    try {
      this.spawnExternalConsole(result.executablePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`External console failed: ${message}`);
      await vscode.window.showErrorMessage(`Lumen: could not open the external console. ${message}`);
      return;
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

  private spawnExternalConsole(executablePath: string): void {
    if (process.platform !== "win32") {
      throw new Error("Lumen currently only launches external consoles on Windows.");
    }

    const workingDir = path.dirname(executablePath);
    // Windows quoting: `start` reads the first quoted arg as the window title, so
    // we always pass an explicit "Lumen" title even when the executable path is
    // simple. `cmd /k ""<path>""` is the documented workaround so that cmd keeps
    // the inner quotes around a path with spaces after stripping the outer pair.
    const commandLine = `start "Lumen" /D "${workingDir}" cmd /k ""${executablePath}""`;

    const child = spawn("cmd.exe", ["/s", "/c", commandLine], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      windowsVerbatimArguments: true
    });
    child.on("error", (error) => {
      this.outputChannel.appendLine(`External console launcher failed: ${error.message}`);
    });
    child.unref();
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
