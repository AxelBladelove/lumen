<script lang="ts">
  import { onMount } from "svelte";
  import type { ModuleTheme } from "../route-path-view/types/routePath";
  import { themeVars } from "../route-path-view/theme/moduleTheme";
  import type { ExerciseDetailPayload } from "../webview/messages";
  import { renderMarkdown } from "./markdown";

  export let detail: ExerciseDetailPayload;
  // Tema del módulo activo: el panel vive fuera del stage de la ruta, así que
  // replica las variables --theme-* aquí para recolorearse por módulo igual
  // que el snake y los nodos (strings verde hoy, matrices morado mañana).
  export let theme: ModuleTheme;
  export let onClose: () => void;

  let panelRef: HTMLDivElement | null = null;
  let revealedHints = 0;

  onMount(() => {
    // Foco al panel: los lectores de pantalla anuncian el dialog y el usuario
    // puede pulsar Tab desde acá; Escape lo maneja App.svelte al nivel de la
    // webview para asegurar que no se dispare `lumen.exit.requested`.
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
  $: isCompleted = detail.status === "completed";
  $: statusLabel = isCompleted ? "COMPLETADO" : "EN CURSO";
  $: revealedHintsList = detail.hints.slice(0, revealedHints);
  $: totalAttempts = detail.progress.attempts.total;
  $: passedAttempts = detail.progress.attempts.passed;
</script>

<div class="detail-layer" style={themeVars(theme)}>
  <div class="detail-scrim" on:click={handleScrimClick} role="presentation"></div>

  <div
    bind:this={panelRef}
    class="detail-panel"
    class:completed={isCompleted}
    role="dialog"
    aria-modal="true"
    aria-label={`Enunciado: ${detail.title}`}
    tabindex="-1"
    on:click={stop}
  >
    <i class="detail-accent" aria-hidden="true"></i>

    <header class="detail-header">
      <span class="status-badge" class:done={isCompleted}>{statusLabel}</span>
      <button class="detail-close" type="button" on:click={onClose} aria-label="Volver a la ruta">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m10.5 6.5-5.5 5.5 5.5 5.5" />
        </svg>
        Ruta
      </button>
    </header>

    <h2 class="detail-title">{detail.title}</h2>
    {#if detail.summary}
      <p class="detail-summary">{detail.summary}</p>
    {/if}

    <div class="detail-meta">
      <span class="meta-chip band">{detail.difficulty.band}</span>
      <span class="meta-chip">≈ {detail.difficulty.expectedMinutes} min</span>
      {#each detail.primaryTopics as topic}
        <span class="meta-chip topic">{topic}</span>
      {/each}
      <span class="meta-attempts" aria-label="Intentos">
        <strong>{passedAttempts}</strong><em>/{totalAttempts} intentos</em>
      </span>
    </div>

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
          <p class="hints-done">No hay más pistas.</p>
        {/if}
      </section>
    {/if}

    <footer class="detail-shortcuts" aria-label="Atajos">
      <span><kbd>F9</kbd> compilar</span>
      <span class="dot" aria-hidden="true">·</span>
      <span><kbd>F10</kbd> probar</span>
    </footer>
  </div>
</div>

<style>
  .detail-layer {
    position: fixed;
    inset: 0;
    z-index: 90;
    font-family: var(--font);
  }

  .detail-scrim {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 50% 38%, color-mix(in srgb, var(--theme-glow) 7%, transparent), transparent 62%),
      rgba(0, 5, 9, 0.7);
    backdrop-filter: blur(7px);
    -webkit-backdrop-filter: blur(7px);
  }

  .detail-panel {
    position: absolute;
    top: 4vh;
    left: 50%;
    display: flex;
    flex-direction: column;
    width: min(720px, calc(100vw - 48px));
    max-height: 92vh;
    padding: 26px 30px 20px;
    overflow-y: auto;
    overflow-x: hidden;
    border: 1px solid var(--panel-border);
    border-radius: 21px;
    color: var(--text-main);
    background: rgba(5, 20, 28, 0.92);
    box-shadow:
      inset 0 1px 0 rgba(244, 252, 251, 0.07),
      inset 0 -20px 42px rgba(0, 0, 0, 0.18),
      0 24px 74px rgba(0, 0, 0, 0.44),
      0 0 34px color-mix(in srgb, var(--theme-glow) 6%, transparent);
    line-height: 1.55;
    transform: translateX(-50%);
    outline: none;
    animation: detailRise 220ms cubic-bezier(0.2, 0.7, 0.25, 1);
  }

  @keyframes detailRise {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .detail-panel {
      animation: none;
    }
  }

  /* Filo superior con el líquido del módulo: la misma firma core→glow del
     snake, para que el panel "pertenezca" al tema igual que la ruta. */
  .detail-accent {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--theme-core), var(--theme-glow), var(--theme-core));
    box-shadow:
      0 0 16px color-mix(in srgb, var(--theme-core) 30%, transparent),
      0 0 28px color-mix(in srgb, var(--theme-glow) 11%, transparent);
  }

  .detail-panel::-webkit-scrollbar {
    width: 8px;
  }

  .detail-panel::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-glow) 22%, rgba(9, 32, 40, 0.6));
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  /* Misma gramática que .continue-badge ("SIGUE AQUÍ") de la ruta. */
  .status-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 118px;
    height: 32px;
    padding: 0 16px;
    border: 1px solid color-mix(in srgb, var(--theme-glow) 56%, transparent);
    border-radius: 999px;
    color: var(--theme-glow);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--theme-glow) 8%, transparent), color-mix(in srgb, var(--theme-glow) 3%, transparent)),
      rgba(0, 18, 25, 0.42);
    box-shadow:
      0 0 18px color-mix(in srgb, var(--theme-glow) 19%, transparent),
      inset 0 1px 0 rgba(244, 252, 251, 0.08),
      inset 0 0 14px color-mix(in srgb, var(--theme-glow) 6%, transparent);
    font-size: 14px;
    font-weight: 850;
    letter-spacing: 0.4px;
    line-height: 1;
  }

  .status-badge.done {
    border-color: color-mix(in srgb, var(--theme-glow) 48%, transparent);
    color: color-mix(in srgb, var(--theme-glow) 86%, #ffffff);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--theme-glow) 7%, transparent), color-mix(in srgb, var(--theme-core) 4%, transparent)),
      rgba(0, 18, 25, 0.36);
    box-shadow:
      0 0 14px color-mix(in srgb, var(--theme-glow) 15%, transparent),
      inset 0 1px 0 rgba(244, 252, 251, 0.08);
  }

  .detail-close {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 16px;
    border: 1px solid color-mix(in srgb, var(--theme-glow) 46%, transparent);
    border-radius: 999px;
    color: color-mix(in srgb, var(--theme-glow) 86%, #ffffff);
    background: rgba(2, 24, 32, 0.58);
    box-shadow:
      0 0 14px color-mix(in srgb, var(--theme-glow) 12%, transparent),
      inset 0 1px 0 rgba(244, 252, 251, 0.1);
    cursor: pointer;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.4px;
    line-height: 1;
    transition: box-shadow 140ms ease, border-color 140ms ease, background 140ms ease;
  }

  .detail-close svg {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    stroke-width: 2.4;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--theme-glow) 40%, transparent));
  }

  .detail-close:hover,
  .detail-close:focus-visible {
    border-color: color-mix(in srgb, var(--theme-glow) 72%, transparent);
    background: rgba(0, 30, 42, 0.72);
    box-shadow:
      0 0 23px color-mix(in srgb, var(--theme-glow) 26%, transparent),
      inset 0 1px 0 rgba(244, 252, 251, 0.11),
      inset 0 0 18px color-mix(in srgb, var(--theme-glow) 8%, transparent);
    outline: none;
  }

  /* Título blanco caliente + subtítulo glow: la pareja tipográfica de los
     nodos de la ruta (.node-label h3 / p). */
  .detail-title {
    margin: 0;
    color: var(--text-hot);
    font-size: 27px;
    line-height: 30px;
    font-weight: 800;
    text-shadow: 0 3px 14px rgba(0, 0, 0, 0.64);
  }

  .detail-summary {
    margin: 8px 0 0;
    color: var(--theme-glow);
    font-size: 18px;
    line-height: 24px;
    font-weight: 520;
    text-shadow: 0 0 10px color-mix(in srgb, var(--theme-glow) 20%, transparent);
  }

  .detail-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 16px 0 6px;
  }

  .meta-chip {
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 12px;
    border: 1px solid var(--panel-border);
    border-radius: 999px;
    color: var(--text-muted);
    background: rgba(0, 16, 23, 0.55);
    font-size: 12.5px;
    font-weight: 650;
    letter-spacing: 0.2px;
    white-space: nowrap;
  }

  .meta-chip.band {
    border-color: color-mix(in srgb, var(--theme-glow) 42%, transparent);
    color: color-mix(in srgb, var(--theme-glow) 84%, #ffffff);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--theme-glow) 8%, transparent), transparent),
      rgba(0, 18, 25, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 800;
    font-size: 11.5px;
  }

  .meta-chip.topic {
    color: color-mix(in srgb, var(--theme-glow) 62%, var(--text-main));
    font-family: var(--mono);
    font-size: 12px;
  }

  /* Métrica de intentos con la tipografía de .progress-metric. */
  .meta-attempts {
    display: inline-flex;
    align-items: baseline;
    margin-left: auto;
    white-space: nowrap;
  }

  .meta-attempts strong {
    color: var(--theme-glow);
    font-size: 20px;
    line-height: 1;
    font-weight: 780;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 14px color-mix(in srgb, var(--theme-glow) 42%, transparent);
  }

  .meta-attempts em {
    margin-left: 5px;
    color: var(--text-muted);
    font-size: 14px;
    font-style: normal;
  }

  .detail-statement {
    margin: 14px 0 20px;
    color: var(--text-main);
    font-size: 15.5px;
  }

  /* El h1 del statement duplica el título del panel: fuera. */
  .detail-statement :global(h1:first-child) {
    display: none;
  }

  .detail-statement :global(h1) {
    margin: 20px 0 8px;
    color: var(--text-hot);
    font-size: 20px;
    font-weight: 780;
    line-height: 1.25;
  }

  /* Secciones (Entrada / Salida / Ejemplos / Notas) como labels del chrome
     del módulo: uppercase espaciado, glow y tick de líquido core→glow. */
  .detail-statement :global(h2),
  .detail-statement :global(h3) {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 22px 0 10px;
    color: color-mix(in srgb, var(--theme-glow) 78%, #ffffff);
    font-size: 13.5px;
    font-weight: 850;
    line-height: 1.3;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    text-shadow: 0 0 12px color-mix(in srgb, var(--theme-glow) 26%, transparent);
  }

  .detail-statement :global(h2)::before,
  .detail-statement :global(h3)::before {
    content: "";
    width: 18px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--theme-core), var(--theme-glow));
    box-shadow: 0 0 10px color-mix(in srgb, var(--theme-glow) 42%, transparent);
    flex: none;
  }

  .detail-statement :global(p) {
    margin: 8px 0;
  }

  .detail-statement :global(ul) {
    margin: 8px 0 8px 4px;
    padding: 0;
    list-style: none;
  }

  .detail-statement :global(li) {
    position: relative;
    margin: 6px 0;
    padding-left: 20px;
  }

  .detail-statement :global(li)::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 0.62em;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-glow) 78%, #ffffff);
    box-shadow: 0 0 8px color-mix(in srgb, var(--theme-glow) 48%, transparent);
  }

  .detail-statement :global(code) {
    padding: 1px 7px;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--theme-glow) 14%, transparent);
    background: rgba(0, 14, 20, 0.72);
    color: color-mix(in srgb, var(--theme-glow) 74%, #ffffff);
    font-family: var(--mono);
    font-size: 0.9em;
  }

  .detail-statement :global(pre) {
    margin: 12px 0;
    padding: 13px 16px;
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    background: rgba(0, 11, 16, 0.82);
    box-shadow: inset 0 1px 0 rgba(244, 252, 251, 0.05);
    overflow-x: auto;
  }

  .detail-statement :global(pre code) {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-hot);
    font-size: 13px;
    line-height: 1.55;
    white-space: pre;
  }

  .detail-statement :global(table) {
    margin: 12px 0;
    width: 100%;
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    border-collapse: separate;
    border-spacing: 0;
    overflow: hidden;
    background: rgba(0, 14, 21, 0.5);
    font-size: 14.5px;
  }

  .detail-statement :global(th),
  .detail-statement :global(td) {
    padding: 9px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--panel-border) 70%, transparent);
    text-align: left;
  }

  .detail-statement :global(tr:last-child td) {
    border-bottom: none;
  }

  .detail-statement :global(th) {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--theme-glow) 7%, transparent), transparent),
      rgba(0, 22, 30, 0.6);
    color: color-mix(in srgb, var(--theme-glow) 80%, #ffffff);
    font-size: 12px;
    font-weight: 850;
    letter-spacing: 0.9px;
    text-transform: uppercase;
  }

  .detail-statement :global(td code) {
    color: var(--text-hot);
  }

  .detail-statement :global(strong) {
    color: var(--text-hot);
  }

  .detail-hints {
    margin-bottom: 18px;
    padding: 16px 18px;
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    background: rgba(0, 14, 22, 0.5);
    box-shadow: inset 0 1px 0 rgba(244, 252, 251, 0.05);
  }

  .detail-hints h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 12px;
    color: color-mix(in srgb, var(--theme-glow) 78%, #ffffff);
    font-size: 13.5px;
    font-weight: 850;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    text-shadow: 0 0 12px color-mix(in srgb, var(--theme-glow) 26%, transparent);
  }

  .detail-hints h3::before {
    content: "";
    width: 18px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--theme-core), var(--theme-glow));
    box-shadow: 0 0 10px color-mix(in srgb, var(--theme-glow) 42%, transparent);
  }

  .hint {
    position: relative;
    margin: 0 0 10px;
    padding: 10px 14px 10px 18px;
    border-radius: 10px;
    background: rgba(0, 20, 29, 0.55);
  }

  .hint::before {
    content: "";
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--theme-glow), var(--theme-core));
    box-shadow: 0 0 9px color-mix(in srgb, var(--theme-glow) 44%, transparent);
  }

  .hint-order {
    display: block;
    margin-bottom: 4px;
    color: var(--theme-glow);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    text-shadow: 0 0 10px color-mix(in srgb, var(--theme-glow) 30%, transparent);
  }

  .hint p {
    margin: 0;
    color: var(--text-main);
    font-size: 14.5px;
    line-height: 1.5;
  }

  .hint-reveal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 118px;
    height: 32px;
    padding: 0 18px;
    border: 1px solid color-mix(in srgb, var(--theme-glow) 56%, transparent);
    border-radius: 999px;
    color: var(--theme-glow);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--theme-glow) 8%, transparent), color-mix(in srgb, var(--theme-glow) 3%, transparent)),
      rgba(0, 18, 25, 0.42);
    box-shadow:
      0 0 18px color-mix(in srgb, var(--theme-glow) 19%, transparent),
      inset 0 1px 0 rgba(244, 252, 251, 0.08),
      inset 0 0 14px color-mix(in srgb, var(--theme-glow) 6%, transparent);
    cursor: pointer;
    font-size: 13px;
    font-weight: 850;
    letter-spacing: 0.3px;
    line-height: 1;
    transition: box-shadow 140ms ease, border-color 140ms ease;
  }

  .hint-reveal:hover,
  .hint-reveal:focus-visible {
    border-color: color-mix(in srgb, var(--theme-glow) 82%, transparent);
    box-shadow:
      0 0 26px color-mix(in srgb, var(--theme-glow) 30%, transparent),
      inset 0 1px 0 rgba(244, 252, 251, 0.1),
      inset 0 0 18px color-mix(in srgb, var(--theme-glow) 9%, transparent);
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
    gap: 10px;
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--panel-border) 60%, transparent);
    color: var(--text-muted);
    font-size: 12.5px;
  }

  .detail-shortcuts .dot {
    color: color-mix(in srgb, var(--theme-glow) 50%, var(--text-muted));
  }

  .detail-shortcuts kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 21px;
    margin-right: 5px;
    padding: 0 6px;
    border: 1px solid color-mix(in srgb, var(--theme-glow) 28%, var(--panel-border));
    border-radius: 6px;
    background: rgba(0, 16, 23, 0.7);
    box-shadow:
      inset 0 1px 0 rgba(244, 252, 251, 0.08),
      0 0 10px color-mix(in srgb, var(--theme-glow) 8%, transparent);
    color: color-mix(in srgb, var(--theme-glow) 72%, #ffffff);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }
</style>
