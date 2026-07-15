export type FrameRequest = (callback: FrameRequestCallback) => number;
export type FrameCancel = (handle: number) => void;

type FrameBarrierOptions = {
  paintOpportunities: number;
  requestFrame: FrameRequest;
  cancelFrame: FrameCancel;
  onReady: () => void;
};

/**
 * Ejecuta `onReady` en el callback posterior a `paintOpportunities` ciclos
 * completos de presentación. Como rAF corre antes del paint, dos oportunidades
 * requieren tres callbacks: preparar -> paint 1 -> paint 2 -> ready.
 */
export function scheduleAfterPaintOpportunities(options: FrameBarrierOptions) {
  const paintOpportunities = Math.max(0, Math.floor(options.paintOpportunities));
  let active = true;
  let frameHandle = 0;

  const queue = (remainingPaints: number) => {
    frameHandle = options.requestFrame(() => {
      frameHandle = 0;
      if (!active) return;
      if (remainingPaints === 0) {
        active = false;
        options.onReady();
        return;
      }
      queue(remainingPaints - 1);
    });
  };

  queue(paintOpportunities);

  return () => {
    if (!active) return;
    active = false;
    if (frameHandle) options.cancelFrame(frameHandle);
    frameHandle = 0;
  };
}
