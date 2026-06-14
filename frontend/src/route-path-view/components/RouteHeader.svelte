<script lang="ts">
  export let routeTitle: string;
  export let moduleNumber: number;
  export let title: string;
  export let subtitle: string;
</script>

<header class="route-header">
  <button class="glass-pill back-pill" type="button" aria-label={`Volver a ${routeTitle}`}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 4.5 8 12l7.5 7.5" />
      <path d="M8.5 12H20" />
    </svg>
    <span>{routeTitle}</span>
  </button>

  <div class="title-block">
    <p>MÓDULO {moduleNumber}</p>
    <h1>{title}</h1>
    <span>{subtitle}</span>
  </div>

  <button class="glass-pill modules-pill" type="button" aria-label="Ver módulos">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="6" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="5" cy="18" r="1.5" />
      <path d="M10 6h9M10 12h9M10 18h9" />
    </svg>
    <span>Módulos</span>
  </button>
</header>
