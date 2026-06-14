<script lang="ts">
  export let completed: number;
  export let total: number;
  export let percent: number;

  const segmentCount = 14;
  $: exactSegments = (percent / 100) * segmentCount;
</script>

<section class="progress-card" aria-label="Progreso del módulo">
  <div class="progress-metric left">
    <strong>{completed}</strong><span>/{total} ejercicios</span>
  </div>
  <div class="progress-metric right">
    <strong>{percent}%</strong><span> completado</span>
  </div>
  <div class="progress-segments" aria-hidden="true">
    {#each Array(segmentCount) as _, index}
      <span
        class:done={index + 1 <= Math.floor(exactSegments)}
        class:partial={index === Math.floor(exactSegments)}
        style={`--partial:${Math.max(0.12, exactSegments - Math.floor(exactSegments))}`}
      ></span>
    {/each}
  </div>
</section>
