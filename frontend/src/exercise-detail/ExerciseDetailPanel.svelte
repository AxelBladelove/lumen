<script lang="ts">
  import { onMount } from "svelte";
  import type { ExerciseDetailPayload } from "../webview/messages";
  import { renderMarkdown } from "./markdown";

  export let detail: ExerciseDetailPayload;
  export let onClose: () => void;

  let panelRef: HTMLDivElement | null = null;
  let revealedHints = 0;

  onMount(() => {
    // Foco al panel: los lectores de pantalla anuncian el dialog y el usuario
    // puede pulsar Tab desde aca; Escape ya lo maneja App.svelte al nivel de
    // la webview para asegurar que no se dispare `lumen.exit.requested`.
    panelRef?.focus();
  });

  function revealNextHint() {
    if (revealedHints < detail.hints.length) revealedHints++;
  }

  function handleScrimClick() {
    onClose();
  }

  function stop(event: Event) {
    event.stopPropagation();
  }

  $: statementHtml = renderMarkdown(detail.statementMarkdown);
  $: statusLabel = detail.status === "completed" ? "Completado" : "Activo";
  $: revealedHintsList = detail.hints.slice(0, revealedHints);
  $: totalAttempts = detail.progress.attempts.total;
  $: passedAttempts = detail.progress.attempts.passed;
</script>

<div class="detail-scrim" on:click={handleScrimClick} role="presentation"></div>

<div
  bind:this={panelRef}
  class="detail-panel"
  class:completed={detail.status === "completed"}
  role="dialog"
  aria-modal="true"
  aria-label={`Enunciado: ${detail.title}`}
  tabindex="-1"
  on:click={stop}
>
  <header class="detail-header">
    <div class="detail-chips">
      <span class="chip status" class:status-completed={detail.status === "completed"}
        >{statusLabel}</span
      >
      <span class="chip band">Dificultad · {detail.difficulty.band}</span>
      <span class="chip minutes">≈ {detail.difficulty.expectedMinutes} min</span>
      {#each detail.primaryTopics as topic}
        <span class="chip topic">{topic}</span>
      {/each}
    </div>
    <button class="detail-close" type="button" on:click={onClose} aria-label="Volver a la ruta">
      <span aria-hidden="true">←</span>
      Volver a la ruta
    </button>
  </header>

  <h2 class="detail-title">{detail.title}</h2>
  {#if detail.summary}
    <p class="detail-summary">{detail.summary}</p>
  {/if}

  <section class="detail-progress" aria-label="Estado de intentos">
    <span class="progress-item">
      <span class="progress-value">{passedAttempts}</span>
      <span class="progress-label">aprobados</span>
    </span>
    <span class="progress-sep" aria-hidden="true">·</span>
    <span class="progress-item">
      <span class="progress-value">{totalAttempts}</span>
      <span class="progress-label">intentos</span>
    </span>
  </section>

  <section class="detail-statement" aria-label="Enunciado">
    {@html statementHtml}
  </section>

  {#if detail.hints.length > 0}
    <section class="detail-hints" aria-label="Pistas">
      <h3>Pistas</h3>
      {#each revealedHintsList as hint (hint.order)}
        <article class="hint">
          <span class="hint-order">Pista {hint.order}</span>
          <p>{hint.text}</p>
        </article>
      {/each}
      {#if revealedHints < detail.hints.length}
        <button class="hint-reveal" type="button" on:click={revealNextHint}>
          Mostrar pista {revealedHints + 1} de {detail.hints.length}
        </button>
      {:else}
        <p class="hints-done">No hay mas pistas.</p>
      {/if}
    </section>
  {/if}

  <footer class="detail-shortcuts" aria-label="Atajos">
    <span><kbd>F9</kbd> compilar</span>
    <span aria-hidden="true">·</span>
    <span><kbd>F10</kbd> probar</span>
  </footer>
</div>

<style>
  .detail-scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(0, 6, 10, 0.66);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  .detail-panel {
    position: fixed;
    z-index: 91;
    top: 4vh;
    left: 50%;
    display: flex;
    flex-direction: column;
    width: min(720px, calc(100vw - 32px));
    max-height: 92vh;
    padding: 24px 26px 20px;
    overflow-y: auto;
    border: 1px solid var(--panel-border);
    border-radius: 20px;
    color: var(--text-main);
    background: var(--panel-bg);
    box-shadow:
      0 26px 68px rgba(0, 0, 0, 0.58),
      inset 0 1px 0 rgba(244, 252, 251, 0.06);
    font-family: var(--font);
    line-height: 1.55;
    transform: translateX(-50%);
    outline: none;
  }

  .detail-panel::-webkit-scrollbar {
    width: 8px;
  }
  .detail-panel::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(125, 178, 217, 0.28);
  }

  .detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .detail-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 10px;
    border: 1px solid var(--panel-border);
    border-radius: 999px;
    color: var(--text-hot);
    background: rgba(4, 20, 28, 0.55);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .chip.status {
    color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 76%, #ffffff);
    border-color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 60%, transparent);
    background: rgba(0, 40, 56, 0.5);
  }

  .chip.status.status-completed {
    color: #e8fff5;
    border-color: rgba(120, 220, 176, 0.62);
    background: rgba(0, 42, 30, 0.55);
  }

  .chip.band,
  .chip.minutes {
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-main);
  }

  .chip.topic {
    text-transform: none;
    letter-spacing: 0;
    color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 80%, #ffffff);
    border-color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 40%, transparent);
  }

  .detail-close {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: 1px solid var(--panel-border);
    border-radius: 999px;
    color: var(--text-hot);
    background: rgba(2, 14, 20, 0.62);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    transition: background 120ms ease, border-color 120ms ease;
  }

  .detail-close:hover,
  .detail-close:focus-visible {
    border-color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 62%, transparent);
    background: rgba(0, 32, 46, 0.75);
    outline: none;
  }

  .detail-title {
    margin: 0 0 6px;
    color: var(--text-hot);
    font-size: 24px;
    line-height: 1.2;
    font-weight: 780;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.55);
  }

  .detail-summary {
    margin: 0 0 14px;
    color: var(--text-muted);
    font-size: 15px;
  }

  .detail-progress {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 18px;
    padding: 10px 14px;
    border: 1px solid var(--panel-border);
    border-radius: 12px;
    background: rgba(0, 14, 22, 0.5);
  }

  .progress-item {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }

  .progress-value {
    color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 78%, #ffffff);
    font-size: 20px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .progress-label {
    color: var(--text-muted);
    font-size: 13px;
  }

  .progress-sep {
    color: var(--text-muted);
  }

  .detail-statement {
    margin: 4px 0 20px;
    color: var(--text-main);
    font-size: 15px;
  }

  .detail-statement :global(h1),
  .detail-statement :global(h2),
  .detail-statement :global(h3) {
    margin: 18px 0 8px;
    color: var(--text-hot);
    font-weight: 700;
    line-height: 1.25;
  }

  .detail-statement :global(h1) {
    font-size: 20px;
  }
  .detail-statement :global(h2) {
    font-size: 17px;
  }
  .detail-statement :global(h3) {
    font-size: 15px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 68%, #ffffff);
  }

  .detail-statement :global(p) {
    margin: 8px 0;
  }

  .detail-statement :global(ul) {
    margin: 8px 0 8px 22px;
    padding: 0;
  }

  .detail-statement :global(li) {
    margin: 4px 0;
  }

  .detail-statement :global(code) {
    padding: 1px 6px;
    border-radius: 6px;
    background: rgba(0, 20, 28, 0.72);
    color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 78%, #ffffff);
    font-family: var(--mono);
    font-size: 0.92em;
  }

  .detail-statement :global(pre) {
    margin: 12px 0;
    padding: 12px 14px;
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    background: rgba(0, 12, 18, 0.78);
    overflow-x: auto;
  }

  .detail-statement :global(pre code) {
    padding: 0;
    background: transparent;
    color: var(--text-hot);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre;
  }

  .detail-statement :global(table) {
    margin: 12px 0;
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .detail-statement :global(th),
  .detail-statement :global(td) {
    padding: 8px 10px;
    border: 1px solid var(--panel-border);
    text-align: left;
  }

  .detail-statement :global(th) {
    background: rgba(0, 22, 32, 0.65);
    color: var(--text-hot);
    font-weight: 700;
  }

  .detail-statement :global(strong) {
    color: var(--text-hot);
  }

  .detail-hints {
    margin-bottom: 18px;
    padding: 14px 16px;
    border: 1px solid var(--panel-border);
    border-radius: 12px;
    background: rgba(0, 14, 22, 0.5);
  }

  .detail-hints h3 {
    margin: 0 0 10px;
    color: var(--text-hot);
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .hint {
    margin: 0 0 10px;
    padding: 10px 12px;
    border-left: 3px solid color-mix(in srgb, var(--theme-glow, #5fc8ff) 60%, transparent);
    border-radius: 4px 8px 8px 4px;
    background: rgba(0, 22, 32, 0.55);
  }

  .hint-order {
    display: block;
    margin-bottom: 4px;
    color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 76%, #ffffff);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.7px;
  }

  .hint p {
    margin: 0;
    color: var(--text-main);
    font-size: 14px;
    line-height: 1.5;
  }

  .hint-reveal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border: 1px solid color-mix(in srgb, var(--theme-glow, #5fc8ff) 60%, transparent);
    border-radius: 999px;
    color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 84%, #ffffff);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--theme-glow, #5fc8ff) 10%, transparent), transparent),
      rgba(0, 18, 25, 0.6);
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    transition: background 120ms ease, border-color 120ms ease;
  }

  .hint-reveal:hover,
  .hint-reveal:focus-visible {
    border-color: color-mix(in srgb, var(--theme-glow, #5fc8ff) 82%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--theme-glow, #5fc8ff) 16%, transparent), transparent),
      rgba(0, 26, 36, 0.7);
    outline: none;
  }

  .hints-done {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 13px;
    font-style: italic;
  }

  .detail-shortcuts {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid rgba(93, 147, 161, 0.18);
    color: var(--text-muted);
    font-size: 12px;
  }

  .detail-shortcuts kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 26px;
    height: 20px;
    margin-right: 4px;
    padding: 0 5px;
    border: 1px solid var(--panel-border);
    border-radius: 5px;
    background: rgba(0, 18, 25, 0.7);
    color: var(--text-hot);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }
</style>
