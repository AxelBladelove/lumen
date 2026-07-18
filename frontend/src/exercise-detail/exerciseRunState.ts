import type { ExerciseRunStatePayload } from "../webview/messages";

export type ExerciseRunState = ExerciseRunStatePayload;

export function createExerciseRunState(): ExerciseRunState {
  return { active: null };
}

export function reduceExerciseRunState(
  _state: ExerciseRunState,
  payload: ExerciseRunStatePayload
): ExerciseRunState {
  return { active: payload.active };
}

export function isExerciseRunDisabled(state: ExerciseRunState): boolean {
  return state.active !== null;
}
