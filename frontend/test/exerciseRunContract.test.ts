import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  createExerciseRunState,
  isExerciseRunDisabled,
  reduceExerciseRunState
} from "../src/exercise-detail/exerciseRunState";
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage
} from "../src/webview/messages";

const exerciseDetailPanel = readFileSync(
  new URL("../src/exercise-detail/ExerciseDetailPanel.svelte", import.meta.url),
  "utf8"
);
const extensionProtocol = readFileSync(
  new URL("../../extension/src/lumenProtocol.ts", import.meta.url),
  "utf8"
);

function roundTrip<T>(message: T): T {
  return JSON.parse(JSON.stringify(message)) as T;
}

describe("exercise run webview contract", () => {
  test("round-trips compile y test como intenciones tipadas", () => {
    const compileMessage = {
      type: "exercise.run.requested",
      payload: { kind: "compile" }
    } satisfies WebviewToExtensionMessage;
    const testMessage = {
      type: "exercise.run.requested",
      payload: { kind: "test" }
    } satisfies WebviewToExtensionMessage;

    expect(roundTrip<WebviewToExtensionMessage>(compileMessage)).toEqual(compileMessage);
    expect(roundTrip<WebviewToExtensionMessage>(testMessage)).toEqual(testMessage);
  });

  test("round-trips el estado activo y el estado libre de la consola", () => {
    const runningMessage = {
      type: "exercise.run.state",
      payload: { active: "test" }
    } satisfies ExtensionToWebviewMessage;
    const idleMessage = {
      type: "exercise.run.state",
      payload: { active: null }
    } satisfies ExtensionToWebviewMessage;

    expect(roundTrip<ExtensionToWebviewMessage>(runningMessage)).toEqual(runningMessage);
    expect(roundTrip<ExtensionToWebviewMessage>(idleMessage)).toEqual(idleMessage);
  });

  test("mantiene los literales del contrato en lockstep con la extensión", () => {
    expect(extensionProtocol).toContain('type: "exercise.run.requested";');
    expect(extensionProtocol).toContain('payload: { kind: ExerciseRunKind };');
    expect(extensionProtocol).toContain('type: "exercise.run.state";');
    expect(extensionProtocol).toContain('payload: { active: ExerciseRunKind | null };');
  });

  test("el reducer deshabilita acciones sólo mientras la consola está ocupada", () => {
    const idle = createExerciseRunState();
    const compiling = reduceExerciseRunState(idle, { active: "compile" });
    const testing = reduceExerciseRunState(compiling, { active: "test" });
    const released = reduceExerciseRunState(testing, { active: null });

    expect(isExerciseRunDisabled(idle)).toBe(false);
    expect(isExerciseRunDisabled(compiling)).toBe(true);
    expect(isExerciseRunDisabled(testing)).toBe(true);
    expect(isExerciseRunDisabled(released)).toBe(false);
    expect(idle.active).toBeNull();
  });

  test("el panel conecta ambos botones al lock y expone sus atajos", () => {
    expect(exerciseDetailPanel.match(/disabled=\{runActive !== null\}/g)).toHaveLength(2);
    expect(exerciseDetailPanel).toContain('aria-label="Compilar ejercicio (F9)"');
    expect(exerciseDetailPanel).toContain('aria-label="Probar solución (F10)"');
    expect(exerciseDetailPanel).toContain("Consola en curso");
  });
});
