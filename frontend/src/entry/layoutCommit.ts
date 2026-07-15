export type ViewportGeometry = {
  width: number;
  height: number;
};

export const layoutCommitGeometryThresholdPx = 24;

/**
 * Diagnóstico de telemetría, no barrera visual. El commit autoritativo usa un
 * token host-correlated y una superficie pre-pintada, por lo que también cubre
 * movimientos entre grupos del mismo tamaño.
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
