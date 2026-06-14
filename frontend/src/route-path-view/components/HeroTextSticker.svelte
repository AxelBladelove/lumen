<script lang="ts">
  export let src: string;

  const borderPath =
    "M29.74 14.75C28.14 15.81 26.68 15.22 25.28 20.81C23.88 26.4 19.97 49.99 19.46 55.66C18.95 61.33 20.19 60.85 21.53 62.28C22.87 63.71 28.45 63.86 29.27 66.11C30.09 68.36 25.57 78.35 27.51 78.71C29.45 79.07 38.74 69.66 43.46 68.74C48.18 67.82 58.53 71.84 62.04 72.01C65.55 72.18 67.66 70.99 69.14 70.02C70.62 69.05 71.97 67.12 72.89 64.91C73.81 62.7 75.08 58.24 75.84 53.83C76.6 49.42 78.39 36.69 78.47 32.62C78.55 28.55 77.97 25.94 76.4 24.08C74.83 22.22 72.37 20.48 66.99 18.98C61.61 17.48 42.09 13.66 37 13.08C31.91 12.5 31.34 13.69 29.74 14.75Z";
  const orbitPath =
    "M72.33 53.34C73.96 53.82 80.25 55.12 82.61 56.36C84.97 57.6 86.29 59.3 87.25 61.15C88.21 63 88.79 65.89 88.7 68.04C88.61 70.19 87.76 72.75 86.7 74.73C85.64 76.71 83.82 78.88 81.98 80.54C80.14 82.2 77.32 84.19 75.11 85.21C72.9 86.23 70.33 86.8 68.02 87.01C65.71 87.22 62.84 87.08 60.53 86.56C58.22 86.04 55.46 84.88 53.45 83.73C51.44 82.58 49.28 80.96 47.83 79.29C46.38 77.62 44.84 74.17 44.28 73.21";
</script>

<div class="hero-sticker-shell" aria-hidden="true">
  <img class="hero-text-asset" {src} alt="" loading="eager" decoding="async" fetchpriority="high" draggable="false" />
  <svg class="hero-neon-overlay" viewBox="0 0 100 100" focusable="false">
    <defs>
      <filter id="heroNeonRunnerGlow" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="1.05" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="heroNeonCometGlow" x="-35%" y="-35%" width="170%" height="170%">
        <feGaussianBlur stdDeviation="1.9" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path
      class="hero-border-guide"
      pathLength="1"
      d={borderPath}
    />
    <path
      class="hero-border-comet glow"
      pathLength="1"
      d={borderPath}
    >
      <animate attributeName="stroke-dashoffset" values="0.18;-0.82" dur="4.15s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <path
      class="hero-border-comet tail"
      pathLength="1"
      d={borderPath}
    >
      <animate attributeName="stroke-dashoffset" values="0.12;-0.88" dur="4.15s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <path
      class="hero-border-comet trail"
      pathLength="1"
      d={borderPath}
    >
      <animate attributeName="stroke-dashoffset" values="0.04;-0.96" dur="4.15s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <path
      class="hero-border-comet head"
      pathLength="1"
      d={borderPath}
    >
      <animate attributeName="stroke-dashoffset" values="0;-1" dur="4.15s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <path
      class="hero-border-comet spark"
      pathLength="1"
      d={borderPath}
    >
      <animate attributeName="stroke-dashoffset" values="-0.004;-1.004" dur="4.15s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <path class="hero-orbit-guide" pathLength="1" d={orbitPath} />
    <path class="hero-orbit-comet glow" pathLength="1" d={orbitPath}>
      <animate attributeName="stroke-dashoffset" values="0;-1" dur="3.4s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <path class="hero-orbit-comet tail" pathLength="1" d={orbitPath}>
      <animate attributeName="stroke-dashoffset" values="0.04;-0.96" dur="3.4s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <path class="hero-orbit-comet trail" pathLength="1" d={orbitPath}>
      <animate attributeName="stroke-dashoffset" values="0.02;-0.98" dur="3.4s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <path class="hero-orbit-comet head" pathLength="1" d={orbitPath}>
      <animate attributeName="stroke-dashoffset" values="0;-1" dur="3.4s" calcMode="linear" repeatCount="indefinite" />
    </path>
    <g class="hero-decor">
      <circle class="hero-star-pulse delay-a" cx="72.31" cy="14.3" r="0.6" />
      <circle class="hero-star-pulse delay-b" cx="77.99" cy="18.14" r="0.58" />
      <path class="hero-star-pulse delay-c" d="M85.65 22.33L85.41 23.44L84.37 23.52L84.29 24.08L85.33 24.24L85.41 25.2L85.96 25.36L86.12 24.32L87.08 24.24L87.32 23.84L86.2 23.52L86.12 22.57Z" />
      <path class="hero-star-pulse delay-d" d="M79.03 81.18L78.79 82.54L77.51 82.7L77.35 83.33L78.71 83.57L78.71 84.61L79.43 85.01L79.67 83.73L80.94 83.57L81.18 83.01L79.82 82.7L79.74 81.42Z" />
      <path class="hero-sparkle-pulse delay-b" d="M82.85 45.61L82.38 47.21L80.54 48.09L82.3 48.96L82.85 50.64L83.41 48.96L85.17 48.17L83.41 47.29Z" />
    </g>
  </svg>
</div>
