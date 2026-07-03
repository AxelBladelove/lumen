<script lang="ts">
  import { onMount } from "svelte";
  import WebGLSnake from "../../webgl-snake/WebGLSnake.svelte";
  import { buildEffectFeatures, materialEffectsV1 } from "../../webgl-snake/materialPresets";
  import type { ModuleTheme, SnakePathConfig } from "../types/routePath";
  import { lockedSnakeTheme } from "../theme/moduleTheme";

  export let path: SnakePathConfig;
  export let theme: ModuleTheme;
  export let lockedStartT = 1;
  export let renderScale = 1;

  const stageSize = { width: 1086, height: 1448 };
  const identityTransform = { x: 0, y: 0, scale: 1 };
  const deterministicVisualTest =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("lumenPerfVisual");
  const effectFeatures = buildEffectFeatures(materialEffectsV1);
  const lockedMaterialEffects = {
    ...materialEffectsV1,
    name: "materialEffectsLockedV1",
    values: {
      ...materialEffectsV1.values,
      textureBrightness: 0.56,
      textureSaturation: 0.16,
      flowStrength: 0.62,
      innerGlowStrength: 0.34,
      cyanRimAmount: 0.1,
      highlightIntensity: 0.68,
      smokeStrength: 0.18,
      wispStrength: 0.14,
      outerGlowStrength: 0.32,
      capGlow: 0.12,
      capSpecularIntensity: 0.44
    }
  };
  const lockedEffectFeatures = buildEffectFeatures(lockedMaterialEffects);
  let webglFirstRender = false;

  onMount(() => {
    (window as any).__LUMEN_DEFERRED_STATUS__ = {
      ...(window as any).__LUMEN_DEFERRED_STATUS__,
      webglSnake: "loading"
    };

    const handleFirstRender = () => {
      webglFirstRender = true;
      (window as any).__LUMEN_DEFERRED_STATUS__.webglSnake = "loaded";
    };
    window.addEventListener("lumen:webgl-first-rendered", handleFirstRender);

    return () => {
      window.removeEventListener("lumen:webgl-first-rendered", handleFirstRender);
    };
  });

  $: splitT = Math.max(0, Math.min(1, lockedStartT));
  $: snakeSegments = [
    {
      id: "unlocked",
      mode: "rawCaps" as const,
      showCaps: true,
      tubeWidth: path.tubeWidth,
      materialPreset: materialEffectsV1,
      effectFeatures,
      theme,
      rangeStart: 0,
      rangeEnd: splitT,
      showStartCap: true,
      showEndCap: false,
      capStyle: "liquid" as const,
      freezeTime: deterministicVisualTest
    },
    {
      id: "locked",
      mode: "rawCaps" as const,
      showCaps: true,
      tubeWidth: path.tubeWidth,
      materialPreset: lockedMaterialEffects,
      effectFeatures: lockedEffectFeatures,
      theme: lockedSnakeTheme,
      rangeStart: splitT,
      rangeEnd: 1,
      showStartCap: false,
      showEndCap: true,
      capStyle: "gray" as const,
      freezeTime: deterministicVisualTest
    }
  ];
</script>

<div class:webgl-ready={webglFirstRender} class="snake-layer" aria-hidden="true">
  <WebGLSnake
    pathD={path.pathD}
    size={stageSize}
    transform={path.transform ?? identityTransform}
    tubeWidth={path.tubeWidth}
    segments={snakeSegments}
    renderScale={renderScale}
  />
</div>
