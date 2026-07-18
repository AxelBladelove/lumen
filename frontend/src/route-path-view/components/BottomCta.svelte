<script lang="ts">
  export let label: string;
  export let targetTitle: string;
  export let disabled = false;
  export let loading = false;
  export let action: "continue" | "details" = "continue";
  export let onContinue: (() => void) | undefined = undefined;

  let handledPointerDown = false;
  $: actionDisabled = disabled || loading;

  function handlePointerDown(event: PointerEvent) {
    if (actionDisabled || event.button !== 0) return;
    handledPointerDown = true;
    onContinue?.();
  }

  function handleClick(event: MouseEvent) {
    if (actionDisabled) {
      handledPointerDown = false;
      return;
    }
    if (handledPointerDown) {
      handledPointerDown = false;
      event.preventDefault();
      return;
    }
    onContinue?.();
  }
</script>

<footer class:module-data-waiting={loading} class="bottom-cta" aria-busy={loading}>
  <svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5" cy="6" r="1.5" />
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="5" cy="18" r="1.5" />
    <path d="M10 6h9M10 12h9M10 18h9" />
  </svg>
  <p><strong>{label}</strong> <span class="cta-target-title">{targetTitle}</span></p>
  <button
    class:details={action === "details"}
    type="button"
    aria-label={loading ? "Cargando el siguiente paso" : action === "details" ? "Ver detalles" : "Continuar"}
    disabled={actionDisabled}
    onpointerdown={handlePointerDown}
    onclick={handleClick}
  >
    {#if action === "details"}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
      </svg>
      <span>Detalles</span>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
      </svg>
    {/if}
  </button>
</footer>
