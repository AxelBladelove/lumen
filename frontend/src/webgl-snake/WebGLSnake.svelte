<script lang="ts">
  import { onMount } from "svelte";
  import type { Mesh as ThreeMesh, Texture as ThreeTextureType } from "three";
  import type { ModuleTheme } from "../route-path-view/types/routePath";

  type Size = { width: number; height: number };
  type Transform = { x: number; y: number; scale: number };
  type TextureUrls = { body: string; capLeft: string; capRight: string };
  type CapStyle = "liquid" | "gray";
  type SnakeMode = "gray" | "raw" | "rawCaps";
  type SnakeSegmentConfig = {
    id?: string;
    mode?: SnakeMode;
    showCaps?: boolean;
    tubeWidth?: number;
    materialPreset: any;
    effectFeatures: any;
    theme: ModuleTheme;
    rangeStart: number;
    rangeEnd: number;
    showStartCap?: boolean;
    showEndCap?: boolean;
    capStyle?: CapStyle;
    freezeTime?: boolean;
  };
  type NormalizedSnakeSegment = Required<
    Pick<
      SnakeSegmentConfig,
      | "id"
      | "mode"
      | "showCaps"
      | "tubeWidth"
      | "materialPreset"
      | "effectFeatures"
      | "theme"
      | "rangeStart"
      | "rangeEnd"
      | "showStartCap"
      | "showEndCap"
      | "capStyle"
      | "freezeTime"
    >
  >;

  const withBase = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
  const isVscodeWebview =
    typeof window !== "undefined" &&
    (typeof window.acquireVsCodeApi === "function" || Boolean(window.__LUMEN_WEBVIEW_BOOTSTRAP__));
  const lowPowerSurface =
    isVscodeWebview ||
    (typeof window !== "undefined" &&
      window.matchMedia("(max-width: 700px), (prefers-reduced-motion: reduce)").matches);
  const pathSampleCount = isVscodeWebview ? 1200 : lowPowerSurface ? 1700 : 2200;
  const ribbonSegments = isVscodeWebview ? 10 : lowPowerSurface ? 14 : 18;
  let THREE: typeof import("three") | null = null;
  let MODE_IDS: Record<SnakeMode, number> | null = null;
  let BloomPipeline: any = null;
  let createImageCapGeometry: any = null;
  let createRibbonGeometry: any = null;
  let createRoundCapGeometry: any = null;
  let sampleSnakePath: any = null;
  let sliceSampledPath: any = null;
  let createCapMaterial: any = null;
  let createGrayCapMaterial: any = null;
  let createSnakeMaterial: any = null;
  let packValues: any = null;

  export let pathD: string;
  export let size: Size;
  export let transform: Transform = { x: 0, y: 0, scale: 1 };
  export let mode: SnakeMode = "rawCaps";
  export let showCaps = true;
  export let tubeWidth = 25;
  export let materialPreset: any;
  export let effectFeatures: any;
  export let freezeTime = false;
  export let theme: ModuleTheme;
  export let rangeStart = 0;
  export let rangeEnd = 1;
  export let showStartCap = true;
  export let showEndCap = true;
  export let capStyle: CapStyle = "liquid";
  export let segments: SnakeSegmentConfig[] | null = null;
  export let renderScale = 1;
  export let textureUrls: TextureUrls = {
    body: withBase("materials/snake-green/body.runtime.webp"),
    capLeft: withBase("materials/snake-green/cap-left.runtime.webp"),
    capRight: withBase("materials/snake-green/cap-right.runtime.webp")
  };

  let host: HTMLDivElement;
  let runtime: any = null;
  let sampledPath: any = null;
  let normalizedSegments: NormalizedSnakeSegment[] = [];

  $: if (pathD && typeof document !== "undefined") {
    sampledPath = sampleSnakePath?.(pathD, pathSampleCount) ?? null;
  }

  $: normalizedSegments = normalizeSegments(
    segments,
    theme,
    materialPreset,
    effectFeatures,
    mode,
    showCaps,
    tubeWidth,
    rangeStart,
    rangeEnd,
    showStartCap,
    showEndCap,
    capStyle,
    freezeTime
  );
  $: if (runtime && sampledPath) syncSegments();

  function normalizeSegments(
    sourceSegments: SnakeSegmentConfig[] | null,
    currentTheme: ModuleTheme,
    currentMaterialPreset: any,
    currentEffectFeatures: any,
    currentMode: SnakeMode,
    currentShowCaps: boolean,
    currentTubeWidth: number,
    currentRangeStart: number,
    currentRangeEnd: number,
    currentShowStartCap: boolean,
    currentShowEndCap: boolean,
    currentCapStyle: CapStyle,
    currentFreezeTime: boolean
  ): NormalizedSnakeSegment[] {
    const segmentConfigs = sourceSegments?.length
      ? sourceSegments
      : currentTheme && currentMaterialPreset && currentEffectFeatures
        ? [
            {
              id: "default",
              mode: currentMode,
              showCaps: currentShowCaps,
              tubeWidth: currentTubeWidth,
              materialPreset: currentMaterialPreset,
              effectFeatures: currentEffectFeatures,
              theme: currentTheme,
              rangeStart: currentRangeStart,
              rangeEnd: currentRangeEnd,
              showStartCap: currentShowStartCap,
              showEndCap: currentShowEndCap,
              capStyle: currentCapStyle,
              freezeTime: currentFreezeTime
            }
          ]
        : [];

    return segmentConfigs.map((segment, index) => {
      const start = Math.max(0, Math.min(1, segment.rangeStart ?? 0));
      const end = Math.max(start + 0.001, Math.min(1, segment.rangeEnd ?? 1));

      return {
        id: segment.id ?? `segment-${index}`,
        mode: segment.mode ?? "rawCaps",
        showCaps: segment.showCaps ?? true,
        tubeWidth: segment.tubeWidth ?? tubeWidth,
        materialPreset: segment.materialPreset,
        effectFeatures: segment.effectFeatures,
        theme: segment.theme,
        rangeStart: start,
        rangeEnd: end,
        showStartCap: segment.showStartCap ?? true,
        showEndCap: segment.showEndCap ?? true,
        capStyle: segment.capStyle ?? "liquid",
        freezeTime: segment.freezeTime ?? false
      };
    });
  }

  function configureTexture(texture: ThreeTextureType) {
    if (!THREE) return texture;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  function fitTextureToGpu(texture: ThreeTextureType, maxTextureSize: number) {
    if (!texture.image) return texture;
    const image = texture.image as HTMLImageElement | HTMLCanvasElement;
    const largestSide = Math.max(image.width, image.height);

    if (largestSide > maxTextureSize) {
      const scale = maxTextureSize / largestSide;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(image.width * scale));
      canvas.height = Math.max(1, Math.floor(image.height * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      (image as { close?: () => void }).close?.();
      texture.image = canvas;
    }

    configureTexture(texture);
    texture.needsUpdate = true;
    return texture;
  }

  function applyThemeToEntry(entry: any, segment: NormalizedSnakeSegment) {
    if (!THREE) return;
    const colors = {
      uCoreColor: new THREE.Color(segment.theme.coreColor),
      uEdgeColor: new THREE.Color(segment.theme.edgeColor),
      uGlowColor: new THREE.Color(segment.theme.glowColor),
      uAccentColor: new THREE.Color(segment.theme.accentColor)
    };

    for (const material of [
      entry.snakeMaterial,
      entry.capLeftMaterial,
      entry.capRightMaterial
    ].filter(Boolean)) {
      for (const [key, color] of Object.entries(colors)) {
        if (material.uniforms?.[key]) {
          material.uniforms[key].value = color;
        }
      }
    }

    if (entry.snakeMaterial.uniforms.uTextureTintStrength) {
      entry.snakeMaterial.uniforms.uTextureTintStrength.value = segment.theme.snakeTintStrength ?? 0;
    }
  }

  function applyPresetToEntry(entry: any, segment: NormalizedSnakeSegment) {
    const packedValues = new Float32Array(packValues(segment.materialPreset.values));
    const capSpecs = new Float32Array(segment.effectFeatures.capSpecs.flat());

    for (const material of [
      entry.snakeMaterial,
      entry.capLeftMaterial,
      entry.capRightMaterial
    ].filter(Boolean)) {
      material.uniforms.uValues.value = packedValues;
    }

    if (entry.capLeftMaterial?.uniforms.uCapSpecs) {
      entry.capLeftMaterial.uniforms.uCapSpecs.value = capSpecs;
    }
    if (entry.capRightMaterial?.uniforms.uCapSpecs) {
      entry.capRightMaterial.uniforms.uCapSpecs.value = capSpecs;
    }
  }

  function applyRangeToEntry(entry: any, segment: NormalizedSnakeSegment) {
    entry.config.rangeStart = segment.rangeStart;
    entry.config.rangeEnd = segment.rangeEnd;
    if (entry.snakeMaterial.uniforms.uRangeStart) {
      entry.snakeMaterial.uniforms.uRangeStart.value = segment.rangeStart;
    }
    if (entry.snakeMaterial.uniforms.uRangeEnd) {
      entry.snakeMaterial.uniforms.uRangeEnd.value = segment.rangeEnd;
    }
    updateCapsForEntry(entry, segment);
  }

  function updateModeForEntry(entry: any, segment: NormalizedSnakeSegment) {
    if (!MODE_IDS) return;
    const modeId = MODE_IDS[segment.mode] ?? MODE_IDS.raw;
    const rawCaps = segment.mode === "rawCaps";

    entry.snakeMaterial.uniforms.uMode.value = modeId;
    if (entry.capLeftMaterial?.uniforms.uMode) {
      entry.capLeftMaterial.uniforms.uMode.value = rawCaps ? MODE_IDS.rawCaps : modeId;
    }
    if (entry.capRightMaterial?.uniforms.uMode) {
      entry.capRightMaterial.uniforms.uMode.value = rawCaps ? MODE_IDS.rawCaps : modeId;
    }

    const glowStrength = segment.materialPreset?.values?.outerGlowStrength ?? 0;
    const glowRadius = segment.materialPreset?.values?.outerGlowRadius ?? 0;
    entry.bloom = rawCaps && glowStrength > 0.01;
    entry.bloomStrength = Math.max(0.05, glowStrength * 2.4);
    entry.bloomRadius = glowRadius;
  }

  function createSegmentEntry(segment: NormalizedSnakeSegment, index: number) {
    if (!THREE) return null;
    const group = new THREE.Group();
    const baseOrder = index * 10;
    const snakeMaterial = createSnakeMaterial(THREE, runtime.bodyTexture);
    const capPlan = capVisibilityPlan(segment);
    const capLeftMaterial = capPlan.liquidStart ? createCapMaterial(THREE, runtime.capLeftTexture) : null;
    const capRightMaterial = capPlan.liquidEnd ? createCapMaterial(THREE, runtime.capRightTexture) : null;
    const grayCapMaterial = capPlan.grayStart || capPlan.grayEnd ? createGrayCapMaterial(THREE) : null;

    const bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), snakeMaterial);
    bodyMesh.frustumCulled = false;
    bodyMesh.renderOrder = baseOrder + 1;

    group.add(bodyMesh);
    runtime.rootGroup.add(group);

    const entry = {
      config: segment,
      group,
      bodyMesh,
      snakeMaterial,
      capLeftMaterial,
      capRightMaterial,
      grayCapMaterial,
      capMeshes: [],
      baseOrder,
      bloom: false,
      bloomStrength: 0,
      bloomRadius: 0
    };

    applyPresetToEntry(entry, segment);
    applyThemeToEntry(entry, segment);
    updateBodyGeometryForEntry(entry, segment);
    applyRangeToEntry(entry, segment);
    updateModeForEntry(entry, segment);
    return entry;
  }

  function updateBodyGeometryForEntry(entry: any, segment: NormalizedSnakeSegment) {
    if (!THREE || !sampledPath) return;
    // Build the ribbon over the FULL path (not just the segment's current
    // range). The fragment shader already masks visibility using
    // uRangeStart/uRangeEnd (see materials.js), so the body mesh never needs
    // to be rebuilt while a segment's range animates (e.g. during the
    // gray-to-green route-advance transition) - only the cheap uniform
    // update in applyRangeToEntry is needed for that.
    const nextGeometry = createRibbonGeometry(THREE, sampledPath, segment.tubeWidth, ribbonSegments);
    entry.bodyMesh.geometry.dispose();
    entry.bodyMesh.geometry = nextGeometry;
  }

  function updateCapsForEntry(entry: any, segment: NormalizedSnakeSegment) {
    if (!THREE || !sampledPath) return;
    const baseOrder = entry.baseOrder ?? 0;
    const visiblePath = sliceSampledPath(sampledPath, segment.rangeStart, segment.rangeEnd);
    const capPlan = capVisibilityPlan(segment);

    entry.capMeshes.forEach((mesh: ThreeMesh) => {
      entry.group.remove(mesh);
      mesh.geometry.dispose();
    });
    entry.capMeshes = [];

    const first = visiblePath.points[0];
    const last = visiblePath.points[visiblePath.points.length - 1];

    if (capPlan.grayStart && entry.grayCapMaterial) {
      entry.capMeshes.push(
        new THREE.Mesh(
          createRoundCapGeometry(THREE, first, first.tangent, segment.tubeWidth / 2, true),
          entry.grayCapMaterial
        )
      );
    }
    if (capPlan.grayEnd && entry.grayCapMaterial) {
      entry.capMeshes.push(
        new THREE.Mesh(
          createRoundCapGeometry(THREE, last, last.tangent, segment.tubeWidth / 2, false),
          entry.grayCapMaterial
        )
      );
    }
    if (capPlan.liquidStart && entry.capLeftMaterial) {
      entry.capMeshes.push(
        new THREE.Mesh(
          createImageCapGeometry(THREE, first, first.tangent, segment.tubeWidth, runtime.capLeftTexture, true),
          entry.capLeftMaterial
        )
      );
    }
    if (capPlan.liquidEnd && entry.capRightMaterial) {
      entry.capMeshes.push(
        new THREE.Mesh(
          createImageCapGeometry(THREE, last, last.tangent, segment.tubeWidth, runtime.capRightTexture, false),
          entry.capRightMaterial
        )
      );
    }

    entry.capMeshes.forEach((mesh: ThreeMesh) => {
      mesh.renderOrder = baseOrder + 2;
    });
    entry.capMeshes.forEach((mesh: ThreeMesh) => entry.group.add(mesh));
  }

  function capVisibilityPlan(segment: NormalizedSnakeSegment) {
    const rawCaps = segment.mode === "rawCaps";
    const grayCaps = segment.mode === "gray" || (rawCaps && segment.capStyle === "gray");
    const liquidCaps = rawCaps && segment.capStyle === "liquid";
    return {
      grayStart: segment.showCaps && segment.showStartCap && grayCaps,
      grayEnd: segment.showCaps && segment.showEndCap && grayCaps,
      liquidStart: segment.showCaps && segment.showStartCap && liquidCaps,
      liquidEnd: segment.showCaps && segment.showEndCap && liquidCaps
    };
  }

  function disposeSegmentEntry(entry: any) {
    runtime.rootGroup.remove(entry.group);
    entry.bodyMesh.geometry.dispose();
    entry.capMeshes.forEach((mesh: ThreeMesh) => mesh.geometry.dispose());
    entry.snakeMaterial.dispose();
    entry.capLeftMaterial?.dispose();
    entry.capRightMaterial?.dispose();
    entry.grayCapMaterial?.dispose();
    entry.group.clear();
  }

  function buildSegmentsKey() {
    const transformKey = transform
      ? `${transform.x.toFixed(3)}:${transform.y.toFixed(3)}:${transform.scale.toFixed(6)}`
      : "identity";
    const segmentKey = normalizedSegments
      .map((segment) =>
        [
          segment.id,
          segment.tubeWidth,
          segment.mode,
          segment.capStyle,
          segment.showCaps ? 1 : 0,
          segment.showStartCap ? 1 : 0,
          segment.showEndCap ? 1 : 0,
          segment.freezeTime ? 1 : 0,
          segment.theme.id,
          segment.theme.coreColor,
          segment.theme.edgeColor,
          segment.theme.glowColor,
          segment.theme.accentColor,
          segment.theme.snakeTintStrength ?? 0,
          segment.materialPreset?.name ?? ""
        ].join(":")
      )
      .join("|");

    return `${pathD}|${transformKey}|${segmentKey}`;
  }

  function syncSegments() {
    if (!runtime || !sampledPath) return;
    const nextSegmentsKey = buildSegmentsKey();
    if (runtime.segmentsKey === nextSegmentsKey) {
      runtime.segmentEntries.forEach((entry: any, index: number) => {
        const segment = normalizedSegments[index];
        if (segment) applyRangeToEntry(entry, segment);
      });
      runtime.needsRender = true;
      return;
    }

    runtime.segmentEntries.forEach(disposeSegmentEntry);
    runtime.segmentEntries = normalizedSegments.map((segment, index) => createSegmentEntry(segment, index));
    runtime.segmentsKey = nextSegmentsKey;

    const animatedEntries = runtime.segmentEntries.filter((entry: any) => !entry.config.freezeTime);
    runtime.hasAnimatedSegments = animatedEntries.length > 0;
    runtime.bloom = runtime.segmentEntries.some((entry: any) => entry.bloom);
    runtime.bloomStrength = Math.max(0.05, ...runtime.segmentEntries.map((entry: any) => entry.bloomStrength));
    runtime.bloomRadius = Math.max(0, ...runtime.segmentEntries.map((entry: any) => entry.bloomRadius));
    runtime.compileReady = false;
    runtime.compileStarted = false;
    runtime.needsRender = true;
    warmSceneForFirstPaint();
  }

  function warmSceneForFirstPaint() {
    if (!runtime || runtime.compileStarted || !runtime.texturesReady || !runtime.segmentEntries.length) return;

    runtime.compileStarted = true;
    mark("lumen:webgl-compile-start");
    runtime.compileReady = true;
    runtime.needsRender = true;
  }

  function disposeTexture(texture: ThreeTextureType) {
    const image = texture.image as { close?: () => void } | undefined;
    texture.dispose();
    image?.close?.();
  }

  function mark(name: string) {
    performance.mark(name);
  }

  function measure(name: string, start: string, end: string) {
    try {
      performance.measure(name, start, end);
    } catch {
      // Some marks are best-effort because texture error paths can complete out of order.
    }
  }

  function updateSize() {
    if (!runtime || !size?.width || !size?.height) return;
    const effectiveRenderScale = isVscodeWebview
      ? Math.max(0.45, Math.min(0.6, renderScale * 1.08))
      : lowPowerSurface
        ? Math.max(0.55, Math.min(0.85, renderScale * 1.5))
        : 1;
    const renderWidth = Math.max(1, Math.round(size.width * effectiveRenderScale));
    const renderHeight = Math.max(1, Math.round(size.height * effectiveRenderScale));
    runtime.renderWidth = renderWidth;
    runtime.renderHeight = renderHeight;
    if (typeof window !== "undefined") {
      (window as any).__LUMEN_WEBGL_STATS__ = {
        ...(window as any).__LUMEN_WEBGL_STATS__,
        renderWidth,
        renderHeight,
        effectiveRenderScale
      };
    }
    runtime.renderer.setSize(renderWidth, renderHeight, false);
    runtime.pipeline.setSize(renderWidth, renderHeight);
    runtime.camera.left = 0;
    runtime.camera.right = size.width;
    runtime.camera.top = 0;
    runtime.camera.bottom = size.height;
    runtime.camera.updateProjectionMatrix();
    runtime.needsRender = true;
  }

  function updateTransform() {
    if (!runtime || !transform) return;
    runtime.rootGroup.position.set(transform.x, transform.y, 0);
    runtime.rootGroup.scale.set(transform.scale, transform.scale, 1);
    runtime.needsRender = true;
  }

  $: if (size?.width && size?.height && renderScale) updateSize();
  $: updateTransform();

  onMount(() => {
    let disposed = false;
    mark("lumen:webgl-mounted");
    mark("lumen:webgl-import-start");
    mark("lumen:webgl-textures-start");
    const nativeBitmapLoads =
      typeof fetch === "function" && typeof createImageBitmap === "function"
        ? {
            body: beginNativeBitmapLoad(textureUrls.body, "body"),
            capLeft: beginNativeBitmapLoad(textureUrls.capLeft, "cap-left"),
            capRight: beginNativeBitmapLoad(textureUrls.capRight, "cap-right")
          }
        : null;

    function beginNativeBitmapLoad(url: string, label: string) {
      mark(`lumen:webgl-texture-${label}-start`);
      return fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Failed to load ${label} texture`);
          return response.blob();
        })
        .then((blob) =>
          createImageBitmap(blob, {
            imageOrientation: "flipY",
            premultiplyAlpha: "none"
          })
        )
        .then((imageBitmap) => {
          mark(`lumen:webgl-texture-${label}-decoded`);
          return imageBitmap;
        });
    }

    void Promise.all([
      import("three"),
      import("./geometry.js"),
      import("./materials.js"),
      import("./postprocess.js")
    ]).then(([three, geometry, materials, postprocess]) => {
      if (disposed) return;
      mark("lumen:webgl-import-end");
      measure("lumen:webgl-import", "lumen:webgl-import-start", "lumen:webgl-import-end");
      THREE = three;
      MODE_IDS = materials.MODE_IDS;
      BloomPipeline = postprocess.BloomPipeline;
      createImageCapGeometry = geometry.createImageCapGeometry;
      createRibbonGeometry = geometry.createRibbonGeometry;
      createRoundCapGeometry = geometry.createRoundCapGeometry;
      sampleSnakePath = geometry.sampleSnakePath;
      sliceSampledPath = geometry.sliceSampledPath;
      createCapMaterial = materials.createCapMaterial;
      createGrayCapMaterial = materials.createGrayCapMaterial;
      createSnakeMaterial = materials.createSnakeMaterial;
      packValues = materials.packValues;
      mark("lumen:webgl-path-sample-start");
      sampledPath = sampleSnakePath(pathD, pathSampleCount);
      mark("lumen:webgl-path-sample-end");
      measure("lumen:webgl-path-sample", "lumen:webgl-path-sample-start", "lumen:webgl-path-sample-end");
      mark("lumen:webgl-context-start");
      const renderer = new THREE.WebGLRenderer({
        antialias: !lowPowerSurface,
        alpha: true,
        premultipliedAlpha: false
      });
      renderer.setClearColor(0x080a0d, 0);
      const pixelRatioCap = isVscodeWebview ? 1 : window.matchMedia("(max-width: 700px)").matches ? 1 : 1.25;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);
      mark("lumen:webgl-context-end");
      measure("lumen:webgl-context", "lumen:webgl-context-start", "lumen:webgl-context-end");

      mark("lumen:webgl-scene-start");
      const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 100);
      const scene = new THREE.Scene();
      const rootGroup = new THREE.Group();
      scene.add(rootGroup);
      mark("lumen:webgl-scene-end");
      measure("lumen:webgl-scene", "lumen:webgl-scene-start", "lumen:webgl-scene-end");

      const textureLoader = new THREE.TextureLoader();
      const bitmapLoader =
        !nativeBitmapLoads && typeof createImageBitmap === "function"
          ? new THREE.ImageBitmapLoader().setOptions({
              imageOrientation: "flipY",
              premultiplyAlpha: "none"
            })
          : null;
      const maxTextureSize = renderer.capabilities.maxTextureSize || 8192;
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1;
      let settledTextureLoads = 0;
    const markTextureSettled = (label: string) => {
      mark(`lumen:webgl-texture-${label}-ready`);
      measure(
        `lumen:webgl-texture-${label}`,
        `lumen:webgl-texture-${label}-start`,
        `lumen:webgl-texture-${label}-ready`
      );
      settledTextureLoads = Math.min(3, settledTextureLoads + 1);
      if (runtime) {
        runtime.texturesReady = settledTextureLoads === 3;
        if (runtime.texturesReady) {
          mark("lumen:webgl-textures-ready");
          measure("lumen:webgl-textures", "lumen:webgl-textures-start", "lumen:webgl-textures-ready");
        }
        runtime.needsRender = true;
        warmSceneForFirstPaint();
      }
    };
    const loadTexture = (url: string, label: string) => {
      const nativeBitmapLoad =
        nativeBitmapLoads?.[label === "body" ? "body" : label === "cap-left" ? "capLeft" : "capRight"];
      if (nativeBitmapLoad) {
        const texture = configureTexture(new THREE.Texture());
        texture.flipY = false;
        texture.anisotropy = maxAnisotropy;
        nativeBitmapLoad.then((imageBitmap) => {
          texture.image = imageBitmap;
          fitTextureToGpu(texture, maxTextureSize);
          mark(`lumen:webgl-texture-${label}-upload-start`);
          runtime?.renderer?.initTexture?.(texture);
          mark(`lumen:webgl-texture-${label}-upload-end`);
          measure(
            `lumen:webgl-texture-${label}-upload`,
            `lumen:webgl-texture-${label}-upload-start`,
            `lumen:webgl-texture-${label}-upload-end`
          );
          if (runtime) runtime.needsRender = true;
          markTextureSettled(label);
        }, () => {
          if (runtime) runtime.needsRender = true;
          markTextureSettled(label);
        });
        return texture;
      }

      mark(`lumen:webgl-texture-${label}-start`);
      if (bitmapLoader) {
        const texture = configureTexture(new THREE.Texture());
        texture.flipY = false;
        texture.anisotropy = maxAnisotropy;
        bitmapLoader.load(url, (imageBitmap) => {
          mark(`lumen:webgl-texture-${label}-decoded`);
          texture.image = imageBitmap;
          fitTextureToGpu(texture, maxTextureSize);
          mark(`lumen:webgl-texture-${label}-upload-start`);
          runtime?.renderer?.initTexture?.(texture);
          mark(`lumen:webgl-texture-${label}-upload-end`);
          measure(
            `lumen:webgl-texture-${label}-upload`,
            `lumen:webgl-texture-${label}-upload-start`,
            `lumen:webgl-texture-${label}-upload-end`
          );
          if (runtime) runtime.needsRender = true;
          markTextureSettled(label);
        }, undefined, () => {
          if (runtime) runtime.needsRender = true;
          markTextureSettled(label);
        });
        return texture;
      }

      const texture = configureTexture(
        textureLoader.load(url, (loadedTexture) => {
          mark(`lumen:webgl-texture-${label}-decoded`);
          fitTextureToGpu(loadedTexture, maxTextureSize);
          mark(`lumen:webgl-texture-${label}-upload-start`);
          runtime?.renderer?.initTexture?.(loadedTexture);
          mark(`lumen:webgl-texture-${label}-upload-end`);
          measure(
            `lumen:webgl-texture-${label}-upload`,
            `lumen:webgl-texture-${label}-upload-start`,
            `lumen:webgl-texture-${label}-upload-end`
          );
          if (runtime) runtime.needsRender = true;
          markTextureSettled(label);
        }, undefined, () => {
          if (runtime) runtime.needsRender = true;
          markTextureSettled(label);
        })
      );
      texture.anisotropy = maxAnisotropy;
      return texture;
    };

      const bodyTexture = loadTexture(textureUrls.body, "body");
      const capLeftTexture = loadTexture(textureUrls.capLeft, "cap-left");
      const capRightTexture = loadTexture(textureUrls.capRight, "cap-right");
      const lowPowerVisuals =
        isVscodeWebview || window.matchMedia("(max-width: 700px), (prefers-reduced-motion: reduce)").matches;
      mark("lumen:webgl-pipeline-start");
      const pipeline = new BloomPipeline(
        THREE,
        renderer,
        isVscodeWebview
          ? { samples: 0, blurPasses: 1, bloomScale: 4, targetType: THREE.UnsignedByteType }
          : lowPowerVisuals
          ? { samples: 0, blurPasses: 1, bloomScale: 4, targetType: THREE.UnsignedByteType }
          : { samples: 2, blurPasses: 5, bloomScale: 2 }
      );
      mark("lumen:webgl-pipeline-end");
      measure("lumen:webgl-pipeline", "lumen:webgl-pipeline-start", "lumen:webgl-pipeline-end");
      const targetFrameInterval = 1000 / 60;
      let lastRenderTime = -targetFrameInterval;

      runtime = {
        renderer,
        camera,
        scene,
        rootGroup,
        pipeline,
        bodyTexture,
        capLeftTexture,
        capRightTexture,
        segmentEntries: [],
        segmentsKey: "",
        hasAnimatedSegments: true,
        bloom: false,
        bloomStrength: 0,
        bloomRadius: 0,
        startTime: performance.now(),
        raf: 0,
        frameTimer: 0,
        disposed: false,
        texturesReady: settledTextureLoads === 3,
        compileReady: false,
        compileStarted: false,
        firstRenderMarked: false,
        renderCount: 0,
        renderDurationTotal: 0,
        maxRenderDuration: 0,
        lastRenderDuration: 0,
        renderWidth: 0,
        renderHeight: 0,
        needsRender: true
      };

      updateSize();
      updateTransform();
      mark("lumen:webgl-segments-start");
      syncSegments();
      mark("lumen:webgl-segments-end");
      measure("lumen:webgl-segments", "lumen:webgl-segments-start", "lumen:webgl-segments-end");

      function frame(now = performance.now()) {
        if (!runtime || runtime.disposed) return;
        const cadenceReady = now - lastRenderTime >= targetFrameInterval;
        const readyForFirstPaint = runtime.texturesReady && runtime.compileReady;
        const forceFirstPaint = readyForFirstPaint && !runtime.firstRenderMarked;
        const shouldRender =
          readyForFirstPaint && (forceFirstPaint || (runtime.hasAnimatedSegments ? cadenceReady : runtime.needsRender));

        if ((forceFirstPaint || !document.hidden) && shouldRender) {
          const elapsed = (now - runtime.startTime) / 1000;
          for (const entry of runtime.segmentEntries) {
            if (!entry.config.freezeTime) {
              entry.snakeMaterial.uniforms.uTime.value = elapsed;
            }
          }
          const renderStarted = performance.now();
          runtime.pipeline.render(runtime.scene, runtime.camera, runtime.bloom, runtime.bloomStrength, runtime.bloomRadius);
          const renderDuration = performance.now() - renderStarted;
          runtime.renderCount += 1;
          runtime.lastRenderDuration = renderDuration;
          runtime.renderDurationTotal += renderDuration;
          runtime.maxRenderDuration = Math.max(runtime.maxRenderDuration, renderDuration);
          (window as any).__LUMEN_WEBGL_STATS__ = {
            ...(window as any).__LUMEN_WEBGL_STATS__,
            renderCount: runtime.renderCount,
            lastRenderMs: renderDuration,
            avgRenderMs: runtime.renderDurationTotal / runtime.renderCount,
            maxRenderMs: runtime.maxRenderDuration,
            targetFrameInterval,
            bloom: runtime.bloom,
            bloomStrength: runtime.bloomStrength,
            bloomRadius: runtime.bloomRadius
          };
          if (!runtime.firstRenderMarked) {
            mark("lumen:webgl-first-render");
            measure("lumen:webgl-mounted-to-first-render", "lumen:webgl-mounted", "lumen:webgl-first-render");
            window.dispatchEvent(new CustomEvent("lumen:webgl-first-rendered"));
            runtime.firstRenderMarked = true;
          }
          runtime.needsRender = false;
          lastRenderTime = now;
        }
        if (document.hidden) {
          runtime.frameTimer = window.setTimeout(() => frame(), 450);
        } else if (isVscodeWebview && !runtime.hasAnimatedSegments && !runtime.needsRender) {
          runtime.frameTimer = window.setTimeout(() => frame(), 220);
        } else {
          runtime.raf = requestAnimationFrame(frame);
        }
      }
      frame();
    });

    return () => {
      disposed = true;
      if (!runtime) return;
      const currentRuntime = runtime;
      currentRuntime.disposed = true;
      cancelAnimationFrame(currentRuntime.raf);
      window.clearTimeout(currentRuntime.frameTimer);
      currentRuntime.pipeline.dispose();
      currentRuntime.segmentEntries.forEach(disposeSegmentEntry);
      disposeTexture(currentRuntime.bodyTexture);
      disposeTexture(currentRuntime.capLeftTexture);
      disposeTexture(currentRuntime.capRightTexture);
      currentRuntime.renderer.dispose();
      currentRuntime.renderer.domElement.parentNode?.removeChild(currentRuntime.renderer.domElement);
      runtime = null;
    };
  });
</script>

<div bind:this={host} class="webgl-host" aria-hidden="true"></div>
