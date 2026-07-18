export const tramoDemoDelayMs = 2_500;

/** Devuelve como máximo los dos avances de la demostración visual (0 → 1 → 2). */
export function nextTramoDemoIndex(
  currentIndex: number,
  tramoCount: number
): number | null {
  const lastDemoIndex = Math.min(2, Math.max(0, Math.trunc(tramoCount) - 1));
  const current = Math.max(0, Math.trunc(currentIndex));

  return current < lastDemoIndex ? current + 1 : null;
}
