<script lang="ts">
  export let completed: number;
  export let total: number;
  export let percent: number;

  const segmentCount = 14;
  $: exactSegments = (percent / 100) * segmentCount;
  $: filledSegments = Array.from({ length: segmentCount }, (_, index) =>
    Math.max(0, Math.min(1, exactSegments - index))
  );
</script>

<section class="progress-card" aria-label="Progreso del módulo">
  <div class="progress-metric left">
    <strong>{completed}</strong><span>/{total} ejercicios</span>
  </div>
  <div class="progress-metric right">
    <strong>{percent}%</strong><span> completado</span>
  </div>
  <div class="progress-segments" aria-hidden="true">
    {#each filledSegments as fill, index}
      <span
        class:filled={fill > 0}
        class:done={fill >= 1}
        class:partial={fill > 0 && fill < 1}
        style={`--fill:${fill > 0 ? Math.max(0.18, fill) : 0}`}
      >
        <i></i>
      </span>
    {/each}
  </div>
</section>
