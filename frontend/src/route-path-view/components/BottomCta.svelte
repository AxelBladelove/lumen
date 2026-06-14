<script lang="ts">
  export let label: string;
  export let targetTitle: string;
  export let disabled = false;
  export let onContinue: (() => void) | undefined = undefined;
</script>

<footer class="bottom-cta">
  <svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5" cy="6" r="1.5" />
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="5" cy="18" r="1.5" />
    <path d="M10 6h9M10 12h9M10 18h9" />
  </svg>
  <p><strong>{label}</strong> {targetTitle}</p>
  <button type="button" aria-label="Continuar" {disabled} onclick={onContinue}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
    </svg>
  </button>
</footer>
