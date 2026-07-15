<script lang="ts">
  import { onMount } from "svelte";

  export let className = "";
  export let radius = 18;
  export let refraction = 0.78;
  export let glassThickness = 18;
  export let ior = 1.45;
  export let dome = 0.055;
  export let aberration = 0.42;
  export let blur = 0.55;
  export let saturation = 100;

  let root: HTMLDivElement;
  let width = 1;
  let height = 1;
  let displacementMap = "";
  let refractionScale = 1;
  const filterId = `lumen-liquid-glass-${Math.random().toString(36).slice(2)}`;

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  function surfaceProfile(x: number) {
    return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
  }

  function calculateRefractionProfile(thickness: number, bezel: number, refractiveIndex: number, samples = 128) {
    const eta = 1 / refractiveIndex;
    const profile = new Float64Array(samples);
    for (let index = 0; index < samples; index += 1) {
      const x = index / samples;
      const y = surfaceProfile(x);
      const delta = x < 1 ? 0.0001 : -0.0001;
      const derivative = (surfaceProfile(x + delta) - y) / delta;
      const magnitude = Math.hypot(derivative, 1);
      const nx = -derivative / magnitude;
      const ny = -1 / magnitude;
      const dot = ny;
      const k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) continue;
      const root = Math.sqrt(k);
      const refractedX = -(eta * dot + root) * nx;
      const refractedY = eta - (eta * dot + root) * ny;
      profile[index] = refractedY === 0 ? 0 : refractedX * ((y * bezel + thickness) / refractedY);
    }
    return profile;
  }

  // Physical rounded-bezel refraction adapted from the technique highlighted
  // by Frontend Masters. Unlike noise displacement, this follows Snell-style
  // refraction and creates a separate illumination map for the glass edge.
  function createOpticalMaps(renderWidth: number, renderHeight: number) {
    const scale = Math.min(1, 420 / Math.max(renderWidth, renderHeight));
    const w = Math.max(2, Math.round(renderWidth * scale));
    const h = Math.max(2, Math.round(renderHeight * scale));
    const displacementCanvas = document.createElement("canvas");
    displacementCanvas.width = w;
    displacementCanvas.height = h;
    const displacementContext = displacementCanvas.getContext("2d");
    if (!displacementContext) return null;

    const displacementImage = displacementContext.createImageData(w, h);
    const displacementData = displacementImage.data;
    for (let index = 0; index < displacementData.length; index += 4) {
      displacementData[index] = 128;
      displacementData[index + 1] = 128;
      displacementData[index + 2] = 0;
      displacementData[index + 3] = 255;
    }

    const r = Math.max(2, Math.min(radius * scale, w / 2, h / 2));
    const bezel = Math.max(1, Math.min(r - 1, h / 2 - 1, r * 0.86));
    const profile = calculateRefractionProfile(glassThickness * scale, bezel, ior);
    const maxDisplacement = Math.max(1, ...Array.from(profile, value => Math.abs(value)));
    const innerRadiusSquared = Math.max(r - bezel, 0) ** 2;
    const radiusSquared = r * r;
    const outerRadiusSquared = (r + 1) ** 2;
    const straightWidth = w - r * 2;
    const straightHeight = h - r * 2;
    for (let py = 0; py < h; py += 1) {
      for (let px = 0; px < w; px += 1) {
        const x = px < r ? px - r : px >= w - r ? px - r - straightWidth : 0;
        const y = py < r ? py - r : py >= h - r ? py - r - straightHeight : 0;
        const distanceSquared = x * x + y * y;
        if (distanceSquared > outerRadiusSquared) continue;
        const distance = Math.sqrt(distanceSquared);
        const fromSide = r - distance;
        const opacity = distanceSquared < radiusSquared
          ? 1
          : 1 - (distance - r) / (Math.sqrt(outerRadiusSquared) - r);
        if (opacity <= 0) continue;
        const cos = distance === 0 ? 0 : x / distance;
        const sin = distance === 0 ? 0 : y / distance;
        const index = (py * w + px) * 4;

        // A very shallow centre dome gives the material the quiet magnification
        // Apple uses on larger Regular surfaces. The stronger bend remains at
        // the bevel, so text behind the middle stays legible.
        const ux = (px + 0.5 - w / 2) / (w / 2);
        const uy = (py + 0.5 - h / 2) / (h / 2);
        const domeFalloff = Math.max(0, 1 - (ux * ux + uy * uy));
        let normalizedX = ux * domeFalloff * dome;
        let normalizedY = uy * domeFalloff * dome;

        if (distanceSquared >= innerRadiusSquared && distance > 0) {
          const profileIndex = Math.min(Math.max(0, Math.floor((fromSide / bezel) * profile.length)), profile.length - 1);
          const displacement = profile[profileIndex] || 0;
          normalizedX -= cos * displacement / maxDisplacement * opacity;
          normalizedY -= sin * displacement / maxDisplacement * opacity;

        }

        displacementData[index] = Math.round(128 + clamp(normalizedX, -1, 1) * 127);
        displacementData[index + 1] = Math.round(128 + clamp(normalizedY, -1, 1) * 127);
      }
    }

    displacementContext.putImageData(displacementImage, 0, 0);
    return {
      displacement: displacementCanvas.toDataURL("image/png"),
      scale: maxDisplacement * refraction / scale
    };
  }

  onMount(() => {
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextWidth = Math.max(1, Math.round(entry.contentRect.width));
        const nextHeight = Math.max(1, Math.round(entry.contentRect.height));
        if (nextWidth === width && nextHeight === height) return;
        width = nextWidth;
        height = nextHeight;
        const maps = createOpticalMaps(width, height);
        if (!maps) return;
        displacementMap = maps.displacement;
        refractionScale = maps.scale;
      });
    });
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });
</script>

<div
  bind:this={root}
  class={`liquid-glass ${className}`}
  style={`--glass-radius:${radius}px;--glass-saturation:${saturation}%`}
>
  <svg class="glass-filter-defs" width={width} height={height} aria-hidden="true">
    <defs>
      <filter id={filterId} x="0" y="0" width={width} height={height} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="BLURRED" />
        <feImage href={displacementMap} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="MAP" />
        <feDisplacementMap in="BLURRED" in2="MAP" scale={refractionScale + aberration} xChannelSelector="R" yChannelSelector="G" result="RED_BEND" />
        <feColorMatrix in="RED_BEND" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="RED" />
        <feDisplacementMap in="BLURRED" in2="MAP" scale={refractionScale} xChannelSelector="R" yChannelSelector="G" result="GREEN_BEND" />
        <feColorMatrix in="GREEN_BEND" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="GREEN" />
        <feDisplacementMap in="BLURRED" in2="MAP" scale={Math.max(0, refractionScale - aberration)} xChannelSelector="R" yChannelSelector="G" result="BLUE_BEND" />
        <feColorMatrix in="BLUE_BEND" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="BLUE" />
        <feBlend in="GREEN" in2="BLUE" mode="screen" result="GREEN_BLUE" />
        <feBlend in="RED" in2="GREEN_BLUE" mode="screen" result="REFRACTED_RGB" />
        <feColorMatrix in="REFRACTED_RGB" type="saturate" values={saturation / 100} />
      </filter>
    </defs>
  </svg>

  <span
    class="glass-warp"
    style={`-webkit-backdrop-filter:url(#${filterId});backdrop-filter:url(#${filterId})`}
    aria-hidden="true"
  ></span>
  <div class="glass-content"><slot /></div>
</div>

<style>
  .liquid-glass {
    position: relative;
    display: block;
    min-width: 0;
    overflow: hidden;
    border-radius: var(--glass-radius);
    isolation: isolate;
    background: transparent;
    box-shadow:
      inset 0 0 0 1px rgba(235, 255, 252, 0.06),
      inset 1.8px 3px 0 -2px rgba(255, 255, 255, 0.34),
      inset -2px -2px 0 -2px rgba(236, 255, 252, 0.25),
      inset -3px -8px 1px -6px rgba(224, 255, 250, 0.18),
      inset -0.3px -1px 4px rgba(0, 7, 9, 0.18),
      inset -1.5px 2.5px 0 -2px rgba(0, 5, 8, 0.28),
      inset 0 3px 4px -2px rgba(0, 5, 8, 0.22),
      inset 2px -6.5px 1px -4px rgba(0, 5, 8, 0.14),
      0 1px 5px rgba(0, 3, 6, 0.1),
      0 9px 24px rgba(0, 3, 6, 0.12);
  }

  /* La luz sólo alcanza el bisel: el centro continúa completamente transparente. */
  .liquid-glass::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    padding: 1px;
    border-radius: inherit;
    pointer-events: none;
    background:
      radial-gradient(circle at 0 0, rgba(250, 255, 254, 0.24), transparent 27%),
      radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--theme-glow) 9%, rgba(236, 255, 252, 0.11)), transparent 25%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.66;
  }

  .glass-filter-defs {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0;
  }

  .glass-warp {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: -1;
  }

  .glass-content {
    position: relative;
    z-index: 3;
    width: 100%;
    height: 100%;
  }

  @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
    .liquid-glass { background: rgba(4, 26, 33, 0.94); }
    .glass-warp { -webkit-backdrop-filter: none; backdrop-filter: none; filter: none !important; }
  }
</style>
