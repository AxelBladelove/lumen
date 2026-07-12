import * as path from "node:path";
import * as vscode from "vscode";
import type { LumenEngineClient } from "./engine/lumenEngineClient";
import { LumenEngineError } from "./engine/lumenEngineProtocol";

/**
 * Resuelve el `entrypointPath` del ejercicio activo consultando al engine.
 * F9 y F10 comparten exactamente esta fuente: el archivo enfocado en el editor
 * no manda — el engine tiene la última palabra.
 *
 * Devuelve `undefined` con feedback ya presentado si no hay ejercicio activo o
 * si la consulta falla.
 */
export async function resolveActiveEntrypoint(
  engineClient: LumenEngineClient,
  outputChannel: vscode.OutputChannel
): Promise<string | undefined> {
  try {
    const active = await engineClient.getActiveExercise();
    if (active.status === "ready") {
      await vscode.commands.executeCommand("setContext", "lumen.hasActiveExercise", true);
      return active.active.entrypointPath;
    }

    await vscode.commands.executeCommand("setContext", "lumen.hasActiveExercise", false);

    if (active.status === "missing") {
      outputChannel.appendLine(
        `Active exercise ${active.exerciseId} is not installed anymore.`
      );
      await vscode.window.showErrorMessage(
        `Lumen: el ejercicio activo (${active.exerciseId}) ya no está instalado. Importa el .esex o selecciona otro nodo.`
      );
      return undefined;
    }

    outputChannel.appendLine("No active exercise reported by the engine.");
    await vscode.window.showErrorMessage(
      "Lumen: no hay ejercicio activo. Selecciona un nodo en el panel de Lumen."
    );
    return undefined;
  } catch (error) {
    await vscode.commands.executeCommand("setContext", "lumen.hasActiveExercise", false);
    const message =
      error instanceof LumenEngineError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    outputChannel.appendLine(`Unable to resolve active exercise: ${message}`);
    await vscode.window.showErrorMessage(
      `Lumen: no se pudo consultar el ejercicio activo. ${message}`
    );
    return undefined;
  }
}

/**
 * Guarda el documento del entrypoint activo si estaba con cambios en memoria.
 * Devuelve `true` si el archivo quedó persistido (ya estaba limpio o el save
 * corrió con éxito), `false` si el save falló.
 */
export async function saveEntrypointIfDirty(entrypointPath: string): Promise<boolean> {
  const openDoc = vscode.workspace.textDocuments.find(
    (document) =>
      document.uri.scheme === "file" && arePathsEquivalent(document.uri.fsPath, entrypointPath)
  );
  if (!openDoc || !openDoc.isDirty) return true;
  return openDoc.save();
}

function arePathsEquivalent(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}
