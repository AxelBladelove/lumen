import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
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
import { isLumenModeActive } from "./lumenEntry";
import { resolveActiveEntrypoint, saveEntrypointIfDirty } from "./lumenExercise";
import {
  acquireExternalRunReservation,
  launchReport,
  type ExternalRunReservation
} from "./lumenExternalConsole";

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  cyan: "\x1b[36m"
} as const;

export class LumenTestController implements vscode.Disposable {
  private testInFlight = false;

  constructor(
    private readonly engineClient: LumenEngineClient,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly runnerPath: string
  ) {}

  dispose(): void {}

  async testCurrentExercise(
    onNewlyCompleted?: (exerciseId: string) => Promise<void>,
    onRunStarted?: () => void
  ): Promise<LumenExerciseRunTestsResult | undefined> {
    if (!isLumenModeActive()) {
      void vscode.window.showInformationMessage(
        "Lumen: F10 solo prueba dentro de Lumen Mode. Abre Lumen y selecciona un ejercicio."
      );
      return undefined;
    }

    if (this.testInFlight) {
      this.outputChannel.appendLine("Test requested while another test run is in flight; ignoring.");
      return undefined;
    }

    // F9 y F10 comparten el mismo entrypoint activo. Se guarda antes de operar
    // para que el engine no compile una copia obsoleta del ejercicio en disco.
    const entrypointPath = await resolveActiveEntrypoint(this.engineClient, this.outputChannel);
    if (!entrypointPath) return undefined;
    const saved = await saveEntrypointIfDirty(entrypointPath);
    if (!saved) {
      await vscode.window.showErrorMessage(
        `Lumen: no se pudo guardar ${path.basename(entrypointPath)} antes de probar.`
      );
      return undefined;
    }
    const reservation = acquireExternalRunReservation();
    if (!reservation) {
      void vscode.window.showWarningMessage(
        "Ya hay una ventana externa de Lumen abierta. Ciérrala antes de probar de nuevo."
      );
      return undefined;
    }

    this.testInFlight = true;
    onRunStarted?.();
    let handedOff = false;
    try {
      let result: LumenExerciseRunTestsResult;
      try {
        result = await this.engineClient.runExerciseTests();
      } catch (error) {
        this.handleTestError(error);
        return undefined;
      }

      this.outputChannel.appendLine(
        `Exercise tests ${result.status}: ${result.durationMs}ms.`
      );
      if (result.status !== "compile_error" && result.newlyCompleted) {
        await onNewlyCompleted?.(result.exerciseId);
      }
      const exerciseId = await this.resolveExerciseId(result);
      handedOff = await this.presentResult(result, exerciseId, reservation);
      return result;
    } finally {
      if (!handedOff) reservation.release();
      this.testInFlight = false;
    }
  }

  // Las notificaciones jamas se esperan: una notificacion archivada sin
  // respuesta deja su promesa pendiente para siempre y atascaria testInFlight
  // (mismo bug que tuvo el prompt de crear workspace en lumenEntry).
  private async presentResult(
    result: LumenExerciseRunTestsResult,
    exerciseId: string,
    reservation: ExternalRunReservation
  ): Promise<boolean> {
    const report =
      result.status === "compile_error"
        ? this.renderCompileError(result)
        : this.renderExecutedTests(result);

    const reportPath = path.join(
      os.tmpdir(),
      `lumen-tests-${process.pid}-${Date.now()}-${randomUUID()}.txt`
    );
    let handedOff = false;
    try {
      await writeFile(reportPath, report, "utf8");
      launchReport({
        runnerPath: this.runnerPath,
        reportPath,
        title: `Lumen Tests - ${exerciseId}`,
        exitCode: result.status === "passed" ? 0 : 1,
        reservation
      });
      handedOff = true;
    } catch (error) {
      await unlink(reportPath).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`External test report failed: ${message}`);
      void vscode.window.showErrorMessage(
        `Lumen no pudo abrir el reporte externo de pruebas: ${message}`
      );
    }

    if (result.status === "compile_error") {
      const diagnostic = result.diagnostics[0];
      const detail = diagnostic
        ? `${diagnostic.file ?? "main.c"}:${diagnostic.line ?? "?"} ${diagnostic.message}`
        : "El compilador no reportó un diagnóstico.";
      void vscode.window.showErrorMessage(`Error de compilación: ${detail}`);
      return handedOff;
    }

    if (result.status === "passed") {
      const completed = result.newlyCompleted ? " ¡Ejercicio completado!" : "";
      void vscode.window.showInformationMessage(
        `Solucion correcta: ${result.casesPassed}/${result.casesTotal} casos${completed}`
      );
      return handedOff;
    }

    void vscode.window.showWarningMessage(
      `Solucion incorrecta: ${result.casesPassed}/${result.casesTotal} casos — mira la ventana Lumen Tests`
    );
    return handedOff;
  }

  private renderExecutedTests(result: LumenExerciseTestsExecuted): string {
    const report = new TestReportWriter();
    report.writeLine(
      `${ansi.bold}${ansi.cyan}Probando ${sanitizeTerminalText(result.exerciseId)} v${sanitizeTerminalText(result.version)}${ansi.reset}`
    );
    report.writeLine("");

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
      report.writeLine(
        `${ansi.bold}Grupo ${sanitizeTerminalText(group.groupId)} (${isPublic ? "publico" : "oculto"})${ansi.reset}`
      );

      for (const testCase of group.cases) {
        this.renderTestCase(report, testCase, isPublic);
      }

      if (hasHiddenFailure && groupIndex === lastHiddenGroupIndex) {
        report.writeLine(
          `${ansi.dim}Los casos ocultos no muestran su entrada/salida: comprueban que tu solucion generalice.${ansi.reset}`
        );
      }
    }

    report.writeLine("");
    const verdict =
      result.status === "passed"
        ? `${ansi.bold}${ansi.green}PASSED${ansi.reset}`
        : `${ansi.bold}${ansi.red}FAILED${ansi.reset}`;
    const completed = result.newlyCompleted
      ? `  ${ansi.green}Ejercicio completado${ansi.reset}`
      : "";
    report.writeLine(
      `${verdict}  ${result.casesPassed}/${result.casesTotal} casos — ${result.durationMs} ms${completed}`
    );
    return report.toString();
  }

  private renderTestCase(
    report: TestReportWriter,
    testCase: LumenExerciseTestCase,
    isPublic: boolean
  ): void {
    const caseId = sanitizeTerminalText(testCase.caseId);
    const truncated = testCase.outputTruncated
      ? `  ${ansi.dim}(salida truncada)${ansi.reset}`
      : "";

    if (testCase.status === "passed") {
      report.writeLine(
        `  ${ansi.green}✓${ansi.reset} ${caseId}  (${testCase.durationMs} ms)${truncated}`
      );
      return;
    }

    const status =
      testCase.status === "failed" ? "" : `  ${ansi.red}${testCase.status}${ansi.reset}`;
    report.writeLine(
      `  ${ansi.red}✗${ansi.reset} ${caseId}  (${testCase.durationMs} ms)${status}${truncated}`
    );

    if (!isPublic) return;
    if (testCase.stdinPreview !== undefined) {
      const input = sanitizeTerminalText(testCase.stdinPreview).replace(/\r\n|\r|\n/g, "\\n");
      report.writeLine(`${ansi.dim}      Entrada  : ${input}${ansi.reset}`);
    }
    if (testCase.expected !== undefined) {
      writeMultilineDetail(report, "Esperado ", testCase.expected, ansi.green);
    }
    if (testCase.observed !== undefined) {
      writeMultilineDetail(report, "Tu salida", testCase.observed, ansi.red);
    }
  }

  private renderCompileError(
    result: Extract<LumenExerciseRunTestsResult, { status: "compile_error" }>
  ): string {
    const report = new TestReportWriter();
    report.writeLine(`${ansi.bold}${ansi.red}No compila.${ansi.reset}`);
    report.writeLine("");

    if (result.diagnostics.length === 0) {
      report.writeLine(`${ansi.dim}El compilador no reporto diagnosticos.${ansi.reset}`);
    } else {
      for (const diagnostic of result.diagnostics) {
        report.writeLine(formatDiagnosticLine(diagnostic, "main.c"));
      }
    }

    const errorCount = countDiagnostics(result.diagnostics, "error");
    const warningCount = countDiagnostics(result.diagnostics, "warning");
    report.writeLine("");
    report.writeLine(
      `${ansi.dim}${errorCount} error(es), ${warningCount} advertencia(s) — ${result.durationMs} ms${ansi.reset}`
    );
    return report.toString();
  }

  private async resolveExerciseId(result: LumenExerciseRunTestsResult): Promise<string> {
    if (result.status !== "compile_error") return result.exerciseId;

    try {
      const active = await this.engineClient.getActiveExercise();
      if (active.status === "ready") return active.active.exerciseId;
      if (active.status === "missing") return active.exerciseId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Could not resolve exercise id for test report: ${message}`);
    }
    return "unknown";
  }

  private handleTestError(error: unknown): void {
    if (error instanceof LumenEngineError) {
      this.outputChannel.appendLine(`Exercise test request failed: ${error.code}: ${error.message}`);
      if (error.code === "NO_ACTIVE_EXERCISE") {
        void vscode.window.showErrorMessage(
          "No hay ejercicio activo. Abre o selecciona un ejercicio de Lumen antes de probar la solución."
        );
        return;
      }

      void vscode.window.showErrorMessage(
        `Lumen no pudo probar la solución (${error.code}): ${error.message}`
      );
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`Exercise test request failed: ${message}`);
    void vscode.window.showErrorMessage(`Lumen no pudo probar la solución: ${message}`);
  }
}

class TestReportWriter {
  private readonly lines: string[] = [];

  writeLine(line: string): void {
    this.lines.push(line);
  }

  toString(): string {
    return `${this.lines.join("\r\n")}\r\n`;
  }
}

function writeMultilineDetail(
  report: TestReportWriter,
  label: string,
  value: string,
  color: string
): void {
  const prefix = `      ${label}: `;
  const continuation = " ".repeat(prefix.length);
  const lines = sanitizeTerminalText(value).split(/\r\n|\r|\n/);
  for (const [index, line] of lines.entries()) {
    report.writeLine(`${color}${index === 0 ? prefix : continuation}${line}${ansi.reset}`);
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
