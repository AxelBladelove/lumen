import * as vscode from "vscode";
import type { LumenEngineClient } from "./engine/lumenEngineClient";
import {
  LumenEngineError,
  type LumenCompileDiagnostic,
  type LumenExerciseRunTestsResult,
  type LumenExerciseTestCase,
  type LumenExerciseTestsExecuted
} from "./engine/lumenEngineProtocol";
import { formatDiagnosticLine } from "./lumenCompile";

const testTerminalName = "Lumen Tests";

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  cyan: "\x1b[36m"
} as const;

export class LumenTestController implements vscode.Disposable {
  private terminal: vscode.Terminal | undefined;
  private pty: LumenTestPty | undefined;
  private testInFlight = false;
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

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.terminal?.dispose();
    this.terminal = undefined;
    this.pty = undefined;
  }

  async testCurrentExercise(
    onNewlyCompleted?: (exerciseId: string) => Promise<void>
  ): Promise<LumenExerciseRunTestsResult | undefined> {
    if (this.testInFlight) {
      this.outputChannel.appendLine("Test requested while another test run is in flight; ignoring.");
      return undefined;
    }

    this.testInFlight = true;
    try {
      let result: LumenExerciseRunTestsResult;
      try {
        result = await this.engineClient.runExerciseTests();
      } catch (error) {
        await this.handleTestError(error);
        return undefined;
      }

      this.outputChannel.appendLine(
        `Exercise tests ${result.status}: ${result.durationMs}ms.`
      );
      if (result.status !== "compile_error" && result.newlyCompleted) {
        await onNewlyCompleted?.(result.exerciseId);
      }
      await this.presentResult(result);
      return result;
    } finally {
      this.testInFlight = false;
    }
  }

  private async presentResult(result: LumenExerciseRunTestsResult): Promise<void> {
    if (result.status === "compile_error") {
      this.renderCompileError(result);
      const diagnostic = result.diagnostics[0];
      const detail = diagnostic
        ? `${diagnostic.file ?? "main.c"}:${diagnostic.line ?? "?"} ${diagnostic.message}`
        : "El compilador no reportó un diagnóstico.";
      await vscode.window.showErrorMessage(`Error de compilación: ${detail}`);
      return;
    }

    this.renderExecutedTests(result);

    if (result.status === "passed") {
      const completed = result.newlyCompleted ? " ¡Ejercicio completado!" : "";
      await vscode.window.showInformationMessage(
        `Solucion correcta: ${result.casesPassed}/${result.casesTotal} casos${completed}`
      );
      return;
    }

    await vscode.window.showWarningMessage(
      `Solucion incorrecta: ${result.casesPassed}/${result.casesTotal} casos — mira la terminal Lumen Tests`
    );
  }

  private renderExecutedTests(result: LumenExerciseTestsExecuted): void {
    const pty = this.getOrCreatePty();
    pty.clear();
    pty.writeLine(
      `${ansi.bold}${ansi.cyan}Probando ${sanitizeTerminalText(result.exerciseId)} v${sanitizeTerminalText(result.version)}${ansi.reset}`
    );
    pty.writeLine("");

    let lastHiddenGroupIndex = -1;
    result.groups.forEach((group, index) => {
      if (group.phase !== "public") lastHiddenGroupIndex = index;
    });
    const hasHiddenFailure = result.groups.some(
      (group) =>
        group.phase !== "public" && group.cases.some((testCase) => testCase.status !== "passed")
    );
    for (const [groupIndex, group] of result.groups.entries()) {
      const isPublic = group.phase === "public";
      pty.writeLine(
        `${ansi.bold}Grupo ${sanitizeTerminalText(group.groupId)} (${isPublic ? "publico" : "oculto"})${ansi.reset}`
      );

      for (const testCase of group.cases) {
        this.renderTestCase(pty, testCase, isPublic);
      }

      if (hasHiddenFailure && groupIndex === lastHiddenGroupIndex) {
        pty.writeLine(
          `${ansi.dim}Los casos ocultos no muestran su entrada/salida: comprueban que tu solucion generalice.${ansi.reset}`
        );
      }
    }

    pty.writeLine("");
    const verdict =
      result.status === "passed"
        ? `${ansi.bold}${ansi.green}PASSED${ansi.reset}`
        : `${ansi.bold}${ansi.red}FAILED${ansi.reset}`;
    const completed = result.newlyCompleted
      ? `  ${ansi.green}Ejercicio completado${ansi.reset}`
      : "";
    pty.writeLine(
      `${verdict}  ${result.casesPassed}/${result.casesTotal} casos — ${result.durationMs} ms${completed}`
    );

    this.terminal?.show(result.status === "passed");
  }

  private renderTestCase(
    pty: LumenTestPty,
    testCase: LumenExerciseTestCase,
    isPublic: boolean
  ): void {
    const caseId = sanitizeTerminalText(testCase.caseId);
    const truncated = testCase.outputTruncated
      ? `  ${ansi.dim}(salida truncada)${ansi.reset}`
      : "";

    if (testCase.status === "passed") {
      pty.writeLine(
        `  ${ansi.green}✓${ansi.reset} ${caseId}  (${testCase.durationMs} ms)${truncated}`
      );
      return;
    }

    const status =
      testCase.status === "failed" ? "" : `  ${ansi.red}${testCase.status}${ansi.reset}`;
    pty.writeLine(
      `  ${ansi.red}✗${ansi.reset} ${caseId}  (${testCase.durationMs} ms)${status}${truncated}`
    );

    if (!isPublic) return;
    if (testCase.stdinPreview !== undefined) {
      const input = sanitizeTerminalText(testCase.stdinPreview).replace(/\r\n|\r|\n/g, "\\n");
      pty.writeLine(`${ansi.dim}      Entrada  : ${input}${ansi.reset}`);
    }
    if (testCase.expected !== undefined) {
      writeMultilineDetail(pty, "Esperado ", testCase.expected, ansi.green);
    }
    if (testCase.observed !== undefined) {
      writeMultilineDetail(pty, "Tu salida", testCase.observed, ansi.red);
    }
  }

  private renderCompileError(
    result: Extract<LumenExerciseRunTestsResult, { status: "compile_error" }>
  ): void {
    const pty = this.getOrCreatePty();
    pty.clear();
    pty.writeLine(`${ansi.bold}${ansi.red}No compila.${ansi.reset}`);
    pty.writeLine("");

    if (result.diagnostics.length === 0) {
      pty.writeLine(`${ansi.dim}El compilador no reporto diagnosticos.${ansi.reset}`);
    } else {
      for (const diagnostic of result.diagnostics) {
        pty.writeLine(formatDiagnosticLine(diagnostic, "main.c"));
      }
    }

    const errorCount = countDiagnostics(result.diagnostics, "error");
    const warningCount = countDiagnostics(result.diagnostics, "warning");
    pty.writeLine("");
    pty.writeLine(
      `${ansi.dim}${errorCount} error(es), ${warningCount} advertencia(s) — ${result.durationMs} ms${ansi.reset}`
    );
    this.terminal?.show(false);
  }

  private getOrCreatePty(): LumenTestPty {
    if (this.terminal && this.pty) return this.pty;

    const pty = new LumenTestPty();
    this.terminal = vscode.window.createTerminal({ name: testTerminalName, pty });
    this.pty = pty;
    return pty;
  }

  private async handleTestError(error: unknown): Promise<void> {
    if (error instanceof LumenEngineError) {
      this.outputChannel.appendLine(`Exercise test request failed: ${error.code}: ${error.message}`);
      if (error.code === "NO_ACTIVE_EXERCISE") {
        await vscode.window.showErrorMessage(
          "No hay ejercicio activo. Abre o selecciona un ejercicio de Lumen antes de probar la solución."
        );
        return;
      }

      await vscode.window.showErrorMessage(
        `Lumen no pudo probar la solución (${error.code}): ${error.message}`
      );
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`Exercise test request failed: ${message}`);
    await vscode.window.showErrorMessage(`Lumen no pudo probar la solución: ${message}`);
  }
}

class LumenTestPty implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  readonly onDidWrite = this.writeEmitter.event;
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

function writeMultilineDetail(
  pty: LumenTestPty,
  label: string,
  value: string,
  color: string
): void {
  const prefix = `      ${label}: `;
  const continuation = " ".repeat(prefix.length);
  const lines = sanitizeTerminalText(value).split(/\r\n|\r|\n/);
  for (const [index, line] of lines.entries()) {
    pty.writeLine(`${color}${index === 0 ? prefix : continuation}${line}${ansi.reset}`);
  }
}

function sanitizeTerminalText(value: string): string {
  return value.replace(/\x1b/g, "");
}

function countDiagnostics(
  diagnostics: LumenCompileDiagnostic[],
  kind: LumenCompileDiagnostic["kind"]
): number {
  return diagnostics.filter((diagnostic) => diagnostic.kind === kind).length;
}
