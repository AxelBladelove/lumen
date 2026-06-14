export const materialEffectsV1 = {
  name: "materialEffectsV1",
  seeds: {
    highlightSeed: 12891,
    smokeSeed: 44203,
    wispSeed: 91821,
    edgeNoiseSeed: 31777,
    capSpecularSeed: 72013
  },
  values: {
    overallOpacity: 1,
    textureContrast: 1.02,
    textureBrightness: 0.36,
    textureSaturation: 1.63,
    flowSpeed: 0.25,
    flowStrength: 1.56,
    centerDepth: 0.48,
    innerDarkness: 0.42,
    innerGlowStrength: 0.32,
    innerGlowRadius: 0.55,
    edgeBrightness: 0.2,
    rimIntensity: 0.45,
    rimSharpness: 0.7,
    cyanRimAmount: 0.38,
    highlightIntensity: 0.72,
    highlightWidth: 0.14,
    highlightSoftness: 0.42,
    highlightFrequency: 0.62,
    highlightLength: 0.2,
    highlightCurveBias: 0.55,
    highlightEdgeBias: 0.7,
    highlightRandomness: 0.66,
    smokeStrength: 0.38,
    smokeScale: 0.55,
    smokeSoftness: 0.62,
    smokeContrast: 0.52,
    smokeFlow: 0.35,
    wispStrength: 0.32,
    wispLength: 0.38,
    wispFrequency: 0.36,
    wispOutwardAmount: 0.28,
    wispSoftness: 0.66,
    edgeNoiseStrength: 0.18,
    edgeNoiseScale: 0.48,
    edgeNoiseSoftness: 0.72,
    outerGlowStrength: 0.31,
    outerGlowRadius: 0.03,
    bloomStrength: 0,
    bloomThreshold: 0.82,
    capHighlight: 0.36,
    capGlow: 0.22,
    capSpecularIntensity: 0.75,
    capSpecularSize: 0.18
  }
};

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildEffectFeatures(preset: typeof materialEffectsV1) {
  const { values, seeds } = preset;
  const highlightRand = mulberry32(seeds.highlightSeed);
  const wispRand = mulberry32(seeds.wispSeed);
  const capRand = mulberry32(seeds.capSpecularSeed);
  const highlightCount = Math.round(6 + values.highlightFrequency * 22);
  const wispCount = Math.round(2 + values.wispFrequency * 10);

  const highlights = Array.from({ length: 32 }, (_, index) => {
    if (index >= highlightCount) return [2, 0, 0, 0];
    const start = highlightRand();
    const length = 0.035 + values.highlightLength * 0.22 * (0.35 + highlightRand() * 0.9);
    const sideSign = highlightRand() > 0.52 ? 1 : -1;
    const side = sideSign * (0.52 + values.highlightEdgeBias * 0.35 * highlightRand());
    const width = 0.035 + values.highlightWidth * 0.16 * (0.5 + highlightRand());
    const intensity = values.highlightIntensity * (0.35 + highlightRand() * 0.95);
    const softness = Math.max(0.02, values.highlightSoftness * (0.06 + highlightRand() * 0.16));
    return [start, length, side, width, intensity, softness, highlightRand(), highlightRand()];
  });

  const wisps = Array.from({ length: 16 }, (_, index) => {
    if (index >= wispCount) return [2, 0, 0, 0];
    const start = wispRand();
    const length = 0.035 + values.wispLength * 0.2 * (0.4 + wispRand());
    const side = (wispRand() > 0.5 ? 1 : -1) * (0.82 + wispRand() * 0.22);
    const width = 0.06 + values.wispSoftness * 0.2 * (0.4 + wispRand());
    const intensity = values.wispStrength * (0.25 + wispRand());
    return [start, length, side, width, intensity, wispRand(), wispRand(), wispRand()];
  });

  const capSpecs = Array.from({ length: 8 }, () => [
    capRand(),
    capRand(),
    0.35 + capRand() * 0.65,
    0.04 + values.capSpecularSize * 0.22 * (0.35 + capRand())
  ]);

  return { highlights, wisps, capSpecs };
}
