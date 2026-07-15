export type ViewportGeometry = {
  width: number;
  height: number;
};

export const layoutCommitGeometryThresholdPx = 24;

function cssPixel(value: number) {
  return `${Math.max(0, Math.round(value * 1000) / 1000)}px`;
}

/**
 * La query se instala antes de pedir el split y sólo empieza a coincidir cuando
 * el viewport cambia de verdad. De este modo Chromium retira la cortina en el
 * mismo cálculo de estilo que recibe la nueva geometría, sin esperar a que
 * JavaScript procese un evento de resize.
 */
export function createLayoutCommitMediaQuery(
  source: ViewportGeometry,
  thresholdPx = layoutCommitGeometryThresholdPx
) {
  return [
    `(max-width: ${cssPixel(source.width - thresholdPx)})`,
    `(min-width: ${cssPixel(source.width + thresholdPx)})`,
    `(max-height: ${cssPixel(source.height - thresholdPx)})`,
    `(min-height: ${cssPixel(source.height + thresholdPx)})`
  ].join(", ");
}

export function createLayoutCommitMediaRule(
  source: ViewportGeometry,
  animationDurationMs: number,
  thresholdPx = layoutCommitGeometryThresholdPx
) {
  const mediaQuery = createLayoutCommitMediaQuery(source, thresholdPx);
  return `@media ${mediaQuery} {
  html.lumen-layout-commit-enabled .lumen-intro {
    display: none !important;
  }

  html.lumen-layout-commit-enabled .lumen-route-app {
    animation: lumenUiZoomOut ${animationDurationMs}ms cubic-bezier(0.2, 0.82, 0.24, 1) both;
    transform-origin: 50% 50%;
    will-change: opacity, transform;
  }
}`;
}

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
