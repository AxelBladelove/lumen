import type { SnakePathConfig } from "../types/routePath";

type PathPoint = { x: number; y: number };

const referenceEnvelope = {
  centerX: 500,
  startY: 98,
  endY: 1458,
  anchorCount: 11
};

const pathCache = new Map<string, SnakePathConfig>();

/**
 * Crea una curva estable por tramo dentro del mismo envelope crudo de la
 * referencia. El WebGL y pathMetrics la muestrean después con su pipeline
 * habitual; aquí sólo cambian los datos geométricos, nunca el material.
 */
export function createTramoPath(basePath: SnakePathConfig, tramoIndex: number): SnakePathConfig {
  const safeIndex = Math.max(0, Math.floor(tramoIndex));
  const transform = basePath.transform ?? { x: 0, y: 0, scale: 1 };
  const cacheKey = [
    basePath.id,
    safeIndex,
    basePath.tubeWidth,
    transform.x,
    transform.y,
    transform.scale,
    basePath.materialPreset
  ].join(":");
  const cached = pathCache.get(cacheKey);
  if (cached) return cached;

  const seed = hashSeed(`${basePath.id}:${safeIndex}`);
  const unit = createSeededUnit(seed);
  const phase = -1.18 + unit() * 0.82;
  const cycles = 2.7 + unit() * 0.42;
  const amplitude = 116 + unit() * 13;
  const harmonicAmplitude = 18 + unit() * 11;
  const harmonicPhase = unit() * Math.PI * 2;
  const centerDrift = (unit() - 0.5) * 24;
  const points: PathPoint[] = [];

  for (let index = 0; index < referenceEnvelope.anchorCount; index += 1) {
    const progress = index / (referenceEnvelope.anchorCount - 1);
    const verticalEase = progress * progress * (3 - 2 * progress);
    const primaryWave = Math.sin(progress * Math.PI * 2 * cycles + phase);
    const harmonicWave = Math.sin(progress * Math.PI * 4.4 + harmonicPhase);
    const localJitter = (unit() - 0.5) * 16;
    points.push({
      x:
        referenceEnvelope.centerX +
        centerDrift * (progress - 0.5) +
        primaryWave * amplitude +
        harmonicWave * harmonicAmplitude +
        localJitter,
      y:
        referenceEnvelope.startY +
        (referenceEnvelope.endY - referenceEnvelope.startY) * verticalEase
    });
  }

  const path = {
    ...basePath,
    id: `${basePath.id}-tramo-${safeIndex + 1}`,
    pathD: smoothPath(points)
  };
  pathCache.set(cacheKey, path);
  return path;
}

function smoothPath(points: PathPoint[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${format(points[0].x)} ${format(points[0].y)}`;

  const commands = [`M ${format(points[0].x)} ${format(points[0].y)}`];
  const tension = 0.88;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const controlA = {
      x: current.x + ((next.x - previous.x) / 6) * tension,
      y: current.y + ((next.y - previous.y) / 6) * tension
    };
    const controlB = {
      x: next.x - ((following.x - current.x) / 6) * tension,
      y: next.y - ((following.y - current.y) / 6) * tension
    };
    commands.push(
      `C ${format(controlA.x)} ${format(controlA.y)}, ${format(controlB.x)} ${format(controlB.y)}, ${format(next.x)} ${format(next.y)}`
    );
  }

  return commands.join(" ");
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededUnit(seed: number) {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function format(value: number) {
  return Number(value.toFixed(2));
}
