<script lang="ts">
  import { onMount } from "svelte";
  import {
    AdditiveBlending,
    BufferGeometry,
    ClampToEdgeWrapping,
    Color,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    HalfFloatType,
    ImageBitmapLoader,
    LinearFilter,
    Mesh,
    NoColorSpace,
    NoToneMapping,
    NormalBlending,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    SRGBColorSpace,
    Texture as ThreeTexture,
    TextureLoader,
    Vector2,
    WebGLRenderer,
    WebGLRenderTarget
  } from "three";
  import type { Mesh as ThreeMesh, Texture as ThreeTextureType } from "three";
  import {
    createImageCapGeometry,
    createRibbonGeometry,
    createRoundCapGeometry,
    sampleSnakePath,
    sliceSampledPath
  } from "./geometry.js";
  import { BloomPipeline } from "./postprocess.js";
  import {
    MODE_IDS,
    createCapMaterial,
    createGrayCapMaterial,
    createSnakeMaterial,
    packValues
  } from "./materials.js";
  import type { ModuleTheme } from "../route-path-view/types/routePath";

  type Size = { width: number; height: number };
  type Transform = { x: number; y: number; scale: number };
  type TextureUrls = { body: string; capLeft: string; capRight: string };
  type CapStyle = "liquid" | "gray";
  type SnakeMode = keyof typeof MODE_IDS;
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
  const pathSampleCount = isVscodeWebview ? 1700 : 2200;
  const ribbonSegments = isVscodeWebview ? 14 : 18;
  const THREE = {
    AdditiveBlending,
    BufferGeometry,
    ClampToEdgeWrapping,
    Color,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    HalfFloatType,
    ImageBitmapLoader,
    LinearFilter,
    Mesh,
    NoColorSpace,
    NoToneMapping,
    NormalBlending,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    SRGBColorSpace,
    ThreeTexture,
    TextureLoader,
    Vector2,
    WebGLRenderer,
    WebGLRenderTarget
  };

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
    sampledPath = sampleSnakePath(pathD, pathSampleCount);
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
    texture.colorSpace = NoColorSpace;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
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
    const colors = {
      uCoreColor: new Color(segment.theme.coreColor),
      uEdgeColor: new Color(segment.theme.edgeColor),
      uGlowColor: new Color(segment.theme.glowColor),
      uAccentColor: new Color(segment.theme.accentColor)
    };

    for (const material of [
      entry.snakeMaterial,
      entry.capLeftMaterial,
      entry.capRightMaterial
    ]) {
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
    ]) {
      material.uniforms.uValues.value = packedValues;
    }

    entry.capLeftMaterial.uniforms.uCapSpecs.value = capSpecs;
    entry.capRightMaterial.uniforms.uCapSpecs.value = capSpecs;
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
  }

  function updateModeForEntry(entry: any, segment: NormalizedSnakeSegment) {
    const modeId = MODE_IDS[segment.mode] ?? MODE_IDS.raw;
    const rawCaps = segment.mode === "rawCaps";

    entry.snakeMaterial.uniforms.uMode.value = modeId;
    entry.capLeftMaterial.uniforms.uMode.value = rawCaps ? MODE_IDS.rawCaps : modeId;
    entry.capRightMaterial.uniforms.uMode.value = rawCaps ? MODE_IDS.rawCaps : modeId;

    const [grayStart, grayEnd, liquidStart, liquidEnd] = entry.capMeshes;
    if (grayStart && grayEnd && liquidStart && liquidEnd) {
      grayStart.visible =
        segment.showCaps && segment.showStartCap && (segment.mode === "gray" || (rawCaps && segment.capStyle === "gray"));
      grayEnd.visible =
        segment.showCaps && segment.showEndCap && (segment.mode === "gray" || (rawCaps && segment.capStyle === "gray"));
      liquidStart.visible = segment.showCaps && segment.showStartCap && rawCaps && segment.capStyle === "liquid";
      liquidEnd.visible = segment.showCaps && segment.showEndCap && rawCaps && segment.capStyle === "liquid";
    }

    const glowStrength = segment.materialPreset?.values?.outerGlowStrength ?? 0;
    const glowRadius = segment.materialPreset?.values?.outerGlowRadius ?? 0;
    entry.bloom = rawCaps && glowStrength > 0.01;
    entry.bloomStrength = Math.max(0.05, glowStrength * 2.4);
    entry.bloomRadius = glowRadius;
  }

  function createSegmentEntry(segment: NormalizedSnakeSegment, index: number) {
    const group = new Group();
    const baseOrder = index * 10;
    const snakeMaterial = createSnakeMaterial(THREE, runtime.bodyTexture);
    const capLeftMaterial = createCapMaterial(THREE, runtime.capLeftTexture);
    const capRightMaterial = createCapMaterial(THREE, runtime.capRightTexture);
    const grayCapMaterial = createGrayCapMaterial(THREE);

    const bodyMesh = new Mesh(new BufferGeometry(), snakeMaterial);
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
      bloom: false,
      bloomStrength: 0,
      bloomRadius: 0
    };

    applyPresetToEntry(entry, segment);
    applyThemeToEntry(entry, segment);
    applyRangeToEntry(entry, segment);
    updateGeometryForEntry(entry, segment, baseOrder);
    updateModeForEntry(entry, segment);
    return entry;
  }

  function updateGeometryForEntry(entry: any, segment: NormalizedSnakeSegment, baseOrder: number) {
    const visiblePath = sliceSampledPath(sampledPath, segment.rangeStart, segment.rangeEnd);

    const nextGeometry = createRibbonGeometry(THREE, sampledPath, segment.tubeWidth, ribbonSegments);
    entry.bodyMesh.geometry.dispose();
    entry.bodyMesh.geometry = nextGeometry;

    entry.capMeshes.forEach((mesh: ThreeMesh) => {
      entry.group.remove(mesh);
      mesh.geometry.dispose();
    });
    entry.capMeshes = [];

    const first = visiblePath.points[0];
    const last = visiblePath.points[visiblePath.points.length - 1];
    const grayStart = new Mesh(
      createRoundCapGeometry(THREE, first, first.tangent, segment.tubeWidth / 2, true),
      entry.grayCapMaterial
    );
    const grayEnd = new Mesh(
      createRoundCapGeometry(THREE, last, last.tangent, segment.tubeWidth / 2, false),
      entry.grayCapMaterial
    );
    const liquidStart = new Mesh(
      createImageCapGeometry(THREE, first, first.tangent, segment.tubeWidth, runtime.capLeftTexture, true),
      entry.capLeftMaterial
    );
    const liquidEnd = new Mesh(
      createImageCapGeometry(THREE, last, last.tangent, segment.tubeWidth, runtime.capRightTexture, false),
      entry.capRightMaterial
    );

    grayStart.renderOrder = baseOrder + 2;
    grayEnd.renderOrder = baseOrder + 2;
    liquidStart.renderOrder = baseOrder + 2;
    liquidEnd.renderOrder = baseOrder + 2;
    entry.capMeshes.push(grayStart, grayEnd, liquidStart, liquidEnd);
    entry.capMeshes.forEach((mesh: ThreeMesh) => entry.group.add(mesh));
  }

  function disposeSegmentEntry(entry: any) {
    runtime.rootGroup.remove(entry.group);
    entry.bodyMesh.geometry.dispose();
    entry.capMeshes.forEach((mesh: ThreeMesh) => mesh.geometry.dispose());
    entry.snakeMaterial.dispose();
    entry.capLeftMaterial.dispose();
    entry.capRightMaterial.dispose();
    entry.grayCapMaterial.dispose();
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
    const renderer = runtime.renderer as WebGLRenderer & {
      compileAsync?: (scene: Scene, camera: OrthographicCamera) => Promise<unknown>;
    };
    renderer.compileAsync?.(runtime.scene, runtime.camera).catch(() => undefined);
    runtime.compileReady = true;
    runtime.needsRender = true;
  }

  function disposeTexture(texture: ThreeTextureType) {
    const image = texture.image as { close?: () => void } | undefined;
    texture.dispose();
    image?.close?.();
  }

  function updateSize() {
    if (!runtime || !size?.width || !size?.height) return;
    const effectiveRenderScale = isVscodeWebview
      ? Math.max(0.7, Math.min(0.9, renderScale * 1.55))
      : 1;
    const renderWidth = Math.max(1, Math.round(size.width * effectiveRenderScale));
    const renderHeight = Math.max(1, Math.round(size.height * effectiveRenderScale));
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
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(0x080a0d, 0);
    const pixelRatioCap = isVscodeWebview ? 1 : window.matchMedia("(max-width: 700px)").matches ? 1 : 1.25;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
    renderer.toneMapping = NoToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const camera = new OrthographicCamera(0, 1, 1, 0, -100, 100);
    const scene = new Scene();
    const rootGroup = new Group();
    scene.add(rootGroup);

    const textureLoader = new TextureLoader();
    const bitmapLoader =
      typeof createImageBitmap === "function"
        ? new ImageBitmapLoader().setOptions({
            imageOrientation: "flipY",
            premultiplyAlpha: "none"
          })
        : null;
    const maxTextureSize = renderer.capabilities.maxTextureSize || 8192;
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1;
    let settledTextureLoads = 0;
    const markTextureSettled = () => {
      settledTextureLoads = Math.min(3, settledTextureLoads + 1);
      if (runtime) {
        runtime.texturesReady = settledTextureLoads === 3;
        runtime.needsRender = true;
        warmSceneForFirstPaint();
      }
    };
    const loadTexture = (url: string) => {
      if (bitmapLoader) {
        const texture = configureTexture(new ThreeTexture());
        texture.flipY = false;
        texture.anisotropy = maxAnisotropy;
        bitmapLoader.load(url, (imageBitmap) => {
          texture.image = imageBitmap;
          fitTextureToGpu(texture, maxTextureSize);
          runtime?.renderer?.initTexture?.(texture);
          if (runtime) runtime.needsRender = true;
          markTextureSettled();
        }, undefined, () => {
          if (runtime) runtime.needsRender = true;
          markTextureSettled();
        });
        return texture;
      }

      const texture = configureTexture(
        textureLoader.load(url, (loadedTexture) => {
          fitTextureToGpu(loadedTexture, maxTextureSize);
          runtime?.renderer?.initTexture?.(loadedTexture);
          if (runtime) runtime.needsRender = true;
          markTextureSettled();
        }, undefined, () => {
          if (runtime) runtime.needsRender = true;
          markTextureSettled();
        })
      );
      texture.anisotropy = maxAnisotropy;
      return texture;
    };

    const bodyTexture = loadTexture(textureUrls.body);
    const capLeftTexture = loadTexture(textureUrls.capLeft);
    const capRightTexture = loadTexture(textureUrls.capRight);
    const lowPowerVisuals =
      isVscodeWebview || window.matchMedia("(max-width: 700px), (prefers-reduced-motion: reduce)").matches;
    const pipeline = new BloomPipeline(
      THREE,
      renderer,
      isVscodeWebview
        ? { samples: 0, blurPasses: 3, bloomScale: 3 }
        : lowPowerVisuals
        ? { samples: 0, blurPasses: 4, bloomScale: 3 }
        : { samples: 2, blurPasses: 6, bloomScale: 2 }
    );
    const targetFrameInterval = isVscodeWebview ? 1000 / 60 : lowPowerVisuals ? 1000 / 45 : 1000 / 60;
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
      needsRender: true
    };

    updateSize();
    updateTransform();
    syncSegments();

    function frame(now = performance.now()) {
      if (!runtime || runtime.disposed) return;
      const cadenceReady = now - lastRenderTime >= targetFrameInterval;
      const readyForFirstPaint = runtime.texturesReady && runtime.compileReady;
      const shouldRender = readyForFirstPaint && (runtime.hasAnimatedSegments ? cadenceReady : runtime.needsRender);

      if (!document.hidden && shouldRender) {
        const elapsed = (now - runtime.startTime) / 1000;
        for (const entry of runtime.segmentEntries) {
          if (!entry.config.freezeTime) {
            entry.snakeMaterial.uniforms.uTime.value = elapsed;
          }
        }
        runtime.pipeline.render(runtime.scene, runtime.camera, runtime.bloom, runtime.bloomStrength, runtime.bloomRadius);
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

    return () => {
      if (!runtime) return;
      runtime.disposed = true;
      cancelAnimationFrame(runtime.raf);
      window.clearTimeout(runtime.frameTimer);
      runtime.pipeline.dispose();
      runtime.segmentEntries.forEach(disposeSegmentEntry);
      disposeTexture(bodyTexture);
      disposeTexture(capLeftTexture);
      disposeTexture(capRightTexture);
      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
      runtime = null;
    };
  });
</script>

<div bind:this={host} class="webgl-host" aria-hidden="true"></div>
