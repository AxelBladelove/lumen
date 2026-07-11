import * as vscode from "vscode";
import type { LumenEngineClient } from "./engine/lumenEngineClient";
import {
  LumenEngineError,
  type LumenExerciseRunTestsResult,
  type LumenExerciseTestsExecuted
} from "./engine/lumenEngineProtocol";

export class LumenTestController {
  private testInFlight = false;

  constructor(
    private readonly engineClient: LumenEngineClient,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

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
      const diagnostic = result.diagnostics[0];
      const detail = diagnostic
        ? `${diagnostic.file ?? "main.c"}:${diagnostic.line ?? "?"} ${diagnostic.message}`
        : "El compilador no reportó un diagnóstico.";
      await vscode.window.showErrorMessage(`Error de compilación: ${detail}`);
      return;
    }

    if (result.status === "passed") {
      const completed = result.newlyCompleted ? " ¡Ejercicio completado!" : "";
      await vscode.window.showInformationMessage(
        `Solucion correcta: ${result.casesPassed}/${result.casesTotal} casos${completed}`
      );
      return;
    }

    await vscode.window.showWarningMessage(this.failedMessage(result));
  }

  private failedMessage(result: LumenExerciseTestsExecuted): string {
    const summary = `Solucion incorrecta: ${result.casesPassed}/${result.casesTotal} casos.`;
    const failedCase = result.groups
      .filter((group) => group.phase === "public")
      .flatMap((group) => group.cases)
      .find((testCase) => testCase.status !== "passed");

    if (!failedCase || failedCase.expected === undefined || failedCase.observed === undefined) {
      return summary;
    }

    return `${summary} Primer caso fallido: ${failedCase.caseId}. Esperado: ${failedCase.expected}. Observado: ${failedCase.observed}.`;
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
