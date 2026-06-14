import type { PathTransform } from "../types/routePath";

export type PathPointSample = {
  x: number;
  y: number;
  distance: number;
  u: number;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  angle: number;
};

export type PathSampler = {
  totalLength: number;
  pointAt: (pathT: number) => PathPointSample;
};

const identityTransform: PathTransform = { x: 0, y: 0, scale: 1 };

export function createPathSampler(pathD: string, transform: PathTransform = identityTransform): PathSampler {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  const rawLength = path.getTotalLength();
  const totalLength = rawLength * transform.scale;
  const tangentStep = Math.max(0.75, rawLength / 2200);

  const project = (point: DOMPoint) => ({
    x: point.x * transform.scale + transform.x,
    y: point.y * transform.scale + transform.y
  });

  return {
    totalLength,
    pointAt(pathT: number) {
      const rawDistance = Math.max(0, Math.min(1, pathT)) * rawLength;
      const distance = rawDistance * transform.scale;
      const point = project(path.getPointAtLength(rawDistance));
      const before = project(path.getPointAtLength(Math.max(0, rawDistance - tangentStep)));
      const after = project(path.getPointAtLength(Math.min(rawLength, rawDistance + tangentStep)));
      let tx = after.x - before.x;
      let ty = after.y - before.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;

      return {
        x: point.x,
        y: point.y,
        distance,
        u: totalLength > 0 ? distance / totalLength : 0,
        tangent: { x: tx, y: ty },
        normal: { x: -ty, y: tx },
        angle: Math.atan2(ty, tx)
      };
    }
  };
}
