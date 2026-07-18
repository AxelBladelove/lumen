export const lockedNodeHintCopy = "Completa el paso anterior para desbloquearlo.";
export const lockedNodeHintDurationMs = 2_500;

export interface LockedNodeHintState {
  nodeId: string;
  shownAt: number;
  expiresAt: number;
}

export function showLockedNodeHint(nodeId: string, shownAt: number): LockedNodeHintState {
  return {
    nodeId,
    shownAt,
    expiresAt: shownAt + lockedNodeHintDurationMs
  };
}

export function expireLockedNodeHint(
  state: LockedNodeHintState | null,
  now: number
): LockedNodeHintState | null {
  if (!state || now < state.expiresAt) return state;
  return null;
}
