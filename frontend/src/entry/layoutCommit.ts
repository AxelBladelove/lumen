export type ViewportGeometry = {
  width: number;
  height: number;
};

export const layoutCommitGeometryThresholdPx = 24;

/**
 * Un commit visual sólo existe cuando Chromium aplicó una geometría distinta.
 * Mantener esta decisión pura evita que un callback inicial de ResizeObserver o
 * un mensaje tardío del host retiren la cortina sin que el panel haya cambiado.
 */
export function hasLayoutCommitGeometryChanged(
  source: ViewportGeometry,
  current: ViewportGeometry,
  thresholdPx = layoutCommitGeometryThresholdPx
) {
  return (
    Math.abs(source.width - current.width) >= thresholdPx ||
    Math.abs(source.height - current.height) >= thresholdPx
  );
}
