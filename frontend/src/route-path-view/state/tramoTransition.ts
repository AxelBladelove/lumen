export type TramoTransitionPhase = "idle" | "scrolling" | "settled";
export type TramoTransitionDirection = "backward" | "none" | "forward";

export type TramoTransitionState = {
  phase: TramoTransitionPhase;
  visibleTramoIndex: number;
  targetTramoIndex: number;
  direction: TramoTransitionDirection;
};

/** Inicializa directamente en el tramo correcto: entrar avanzado no anima. */
export function createTramoTransition(
  visibleTramoIndex: number
): TramoTransitionState {
  const index = normalizeIndex(visibleTramoIndex);

  return {
    phase: "idle",
    visibleTramoIndex: index,
    targetTramoIndex: index,
    direction: "none"
  };
}

/**
 * Sincroniza el tramo pedido. Repetir el mismo objetivo durante un scroll es
 * idempotente; con movimiento reducido el objetivo se confirma en el acto.
 */
export function requestTramoTransition(
  state: TramoTransitionState,
  targetTramoIndex: number,
  reducedMotion = false
): TramoTransitionState {
  const target = normalizeIndex(targetTramoIndex);

  if (target === state.targetTramoIndex) {
    if (reducedMotion && state.phase === "scrolling") {
      return {
        phase: "settled",
        visibleTramoIndex: target,
        targetTramoIndex: target,
        direction: state.direction
      };
    }
    return state;
  }

  const direction = directionBetween(state.visibleTramoIndex, target);
  if (reducedMotion) {
    return {
      phase: "settled",
      visibleTramoIndex: target,
      targetTramoIndex: target,
      direction
    };
  }

  return {
    phase: "scrolling",
    visibleTramoIndex: state.visibleTramoIndex,
    targetTramoIndex: target,
    direction
  };
}

/** Confirma el destino al terminar los keyframes. */
export function settleTramoTransition(
  state: TramoTransitionState
): TramoTransitionState {
  if (state.phase !== "scrolling") return state;

  return {
    phase: "settled",
    visibleTramoIndex: state.targetTramoIndex,
    targetTramoIndex: state.targetTramoIndex,
    direction: state.direction
  };
}

function directionBetween(
  from: number,
  to: number
): TramoTransitionDirection {
  if (to > from) return "forward";
  if (to < from) return "backward";
  return "none";
}

function normalizeIndex(index: number): number {
  return Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
}
