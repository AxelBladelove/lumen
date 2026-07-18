<script lang="ts">
  import type { ExerciseDetailPayload, ExerciseRunKind } from "../webview/messages";
  import { extractExamples, renderMarkdownSection } from "./markdown";
  import LiquidGlassSurface from "./LiquidGlassSurface.svelte";

  export let detail: ExerciseDetailPayload;
  export let compact = false;
  export let exiting = false;
  export let runActive: ExerciseRunKind | null = null;
  export let onRunRequested: ((kind: ExerciseRunKind) => void) | undefined = undefined;

  // La sección Ejemplos se lee como datos (pares entrada/salida) para dibujarla
  // como composición propia. Si el enunciado no trae tabla, cae de vuelta al
  // render Markdown normal en vez de perder el contenido.
  $: examples = extractExamples(detail.statementMarkdown, "Ejemplos");
  $: fallbackHtml = examples
    ? ""
    : renderMarkdownSection(detail.statementMarkdown, "Ejemplos");

  function requestRun(kind: ExerciseRunKind) {
    if (runActive !== null) return;
    onRunRequested?.(kind);
  }

</script>

<article
  class="integrated-detail"
  class:compact
  class:is-exiting={exiting}
  aria-label={`Detalles del ejercicio: ${detail.title}`}
>
  <div class="detail-scroll">
    <div class="detail-content">
    <header class="detail-heading">
    <span class="eyebrow">DETALLES DEL EJERCICIO</span>
    <h2>{detail.title}</h2>
    <p>{detail.summary}</p>

    <p class="time-meta" aria-label={`Tiempo estimado: ${detail.difficulty.expectedMinutes} minutos`}>
      <span>TIEMPO ESTIMADO</span>
      <i aria-hidden="true"></i>
      <strong>{detail.difficulty.expectedMinutes} min</strong>
    </p>
  </header>

  <section class="examples-block" aria-labelledby="examples-title">
    <div class="section-title">
      <i aria-hidden="true"></i>
      <h3 id="examples-title">Entrada y salida</h3>
    </div>

    {#if examples}
      <div class="examples-glass-stack">
        <ol class="examples-flow">
          {#each examples.cases as example, caseIndex}
            <li class="example-case" style={`--case-index: ${caseIndex}`}>
              <div class="case-body">
                {#each example.cells as cell, cellIndex}
                  <div class="case-cell" class:is-result={example.cells.length > 1 && cellIndex === example.cells.length - 1}>
                    {#if example.cells.length > 1 && cellIndex === example.cells.length - 1}
                      <span class="case-arrow" aria-hidden="true">
                        <svg viewBox="0 0 12 20" fill="none" stroke="currentColor">
                          <path d="M6 1v13" stroke-width="1.4" stroke-linecap="round" />
                          <path d="M2.5 11.5 6 15l3.5-3.5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </span>
                    {/if}

                    <LiquidGlassSurface
                      className="case-glass"
                      radius={example.cells.length > 1 && cellIndex === example.cells.length - 1 ? 18 : 21}
                      refraction={example.cells.length > 1 && cellIndex === example.cells.length - 1 ? 0.64 : 0.78}
                      glassThickness={example.cells.length > 1 && cellIndex === example.cells.length - 1 ? 13 : 18}
                      blur={1.15}
                      saturation={100}
                    >
                      <div class="cell-content">
                        <span class="cell-label">{@html cell.labelHtml}</span>
                        {#if cell.isEmpty}
                          <span class="cell-value is-blank">
                            <span aria-hidden="true">(vacía)</span>
                            <span class="visually-hidden">sin valor</span>
                          </span>
                        {:else}
                          <span class="cell-value">{@html cell.valueHtml}</span>
                        {/if}
                      </div>
                    </LiquidGlassSurface>
                  </div>
                {/each}
              </div>
            </li>
          {/each}
        </ol>
      </div>

      {#if examples.extraHtml}
        <div class="examples-prose">{@html examples.extraHtml}</div>
      {/if}
    {:else if fallbackHtml}
      <div class="examples-prose">{@html fallbackHtml}</div>
    {:else}
      <p class="examples-empty">Este ejercicio no incluye ejemplos públicos.</p>
    {/if}
  </section>

    </div>
  </div>

  <footer class="run-actions" aria-label="Acciones del ejercicio">
    <div class="run-buttons">
      <LiquidGlassSurface
        className="run-button-glass"
        radius={13}
        refraction={0.64}
        glassThickness={13}
        blur={1.15}
        saturation={100}
      >
        <button
          class="run-button"
          type="button"
          disabled={runActive !== null}
          aria-label="Compilar ejercicio (F9)"
          on:click={() => requestRun("compile")}
        >
          Compilar (F9)
        </button>
      </LiquidGlassSurface>
      <LiquidGlassSurface
        className="run-button-glass"
        radius={13}
        refraction={0.64}
        glassThickness={13}
        blur={1.15}
        saturation={100}
      >
        <button
          class="run-button"
          type="button"
          disabled={runActive !== null}
          aria-label="Probar solución (F10)"
          on:click={() => requestRun("test")}
        >
          Probar solución (F10)
        </button>
      </LiquidGlassSurface>
    </div>

    {#if runActive !== null}
      <p id="exercise-run-status" class="run-status" role="status" aria-live="polite">
        <i aria-hidden="true"></i>
        Consola en curso · {runActive === "compile" ? "Compilando" : "Probando solución"}
      </p>
    {/if}
  </footer>
</article>

<style>
  .integrated-detail {
    position: absolute;
    left: calc(45% - 8px - var(--detail-content-inset, 0px));
    right: 34px;
    top: var(--detail-content-top, 350px);
    /* La CTA vive dentro del mismo stage pero se ancla por su borde superior.
       El panel termina justo antes de ese borde; el margen de .run-actions
       mantiene los controles separados sin dejar una zona que robe clicks. */
    bottom: calc(var(--stage-height, 1448px) - var(--cta-top, 1300px));
    z-index: 10;
    min-width: 0;
    overflow: hidden;
    color: var(--text-main);
    font-family: var(--font);
    opacity: 0;
    transform: translate3d(56px, 0, 0);
    animation: integratedDetailIn 560ms 130ms cubic-bezier(0.18, 0.78, 0.16, 1) forwards;
    pointer-events: none;
  }

  .integrated-detail.is-exiting {
    animation: integratedDetailOut 440ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  /* El cuerpo editorial conserva hit-testing en sus objetos y el contenedor
     de scroll captura rueda/touch; el pie sólo lo activa en sus controles. */
  .eyebrow,
  h2,
  .detail-heading > p,
  .section-title h3,
  .case-cell,
  .examples-prose,
  .examples-empty {
    pointer-events: auto;
  }

  .detail-heading {
    max-width: 680px;
  }

  .detail-scroll {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: 112px;
    pointer-events: auto;
    scrollbar-color: color-mix(in srgb, var(--theme-glow) 30%, transparent) transparent;
    scrollbar-width: thin;
  }

  .detail-scroll::-webkit-scrollbar {
    width: 5px;
  }

  .detail-scroll::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-glow) 30%, transparent);
  }

  .detail-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .detail-content {
    transform: scale(var(--detail-content-scale, 1));
    transform-origin: top left;
    transition: transform 480ms cubic-bezier(0.18, 0.78, 0.16, 1);
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 13px;
    color: var(--theme-glow);
    font-size: 15px;
    font-weight: 850;
    letter-spacing: 1.6px;
  }

  .eyebrow::before {
    content: "";
    width: 34px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--theme-core), var(--theme-glow));
    box-shadow: 0 0 12px color-mix(in srgb, var(--theme-glow) 48%, transparent);
  }

  h2 {
    margin: 24px 0 0;
    color: var(--text-hot);
    font-size: 43px;
    font-weight: 820;
    letter-spacing: -0.9px;
    line-height: 1.08;
    text-wrap: balance;
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.72);
  }

  .detail-heading > p:not(.time-meta) {
    max-width: 640px;
    margin: 24px 0 0;
    color: var(--text-main);
    font-size: 21px;
    line-height: 1.55;
    text-wrap: pretty;
  }

  .time-meta {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin: 28px 0 0;
  }

  .time-meta span {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 850;
    letter-spacing: 1.2px;
  }

  .time-meta i {
    width: 28px;
    height: 1px;
    background: color-mix(in srgb, var(--theme-glow) 42%, transparent);
    box-shadow: 0 0 7px color-mix(in srgb, var(--theme-glow) 24%, transparent);
  }

  .time-meta strong {
    color: color-mix(in srgb, var(--theme-glow) 80%, var(--text-hot));
    font-size: 20px;
    font-weight: 820;
    line-height: 1;
  }

  .examples-block {
    margin-top: var(--detail-examples-gap, 58px);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 22px;
  }

  .section-title i {
    width: 34px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--theme-core), var(--theme-glow));
    box-shadow: 0 0 12px color-mix(in srgb, var(--theme-glow) 48%, transparent);
  }

  .section-title h3 {
    margin: 0;
    color: color-mix(in srgb, var(--theme-glow) 84%, #fff);
    font-size: 17px;
    font-weight: 850;
    letter-spacing: 1.15px;
    text-transform: uppercase;
  }

  /* Cada ejemplo es una relación vertical simple. El material vive dentro de
     LiquidGlassSurface; aquí sólo se define la composición del módulo. */
  .examples-glass-stack {
    position: relative;
    isolation: isolate;
    width: min(100%, 560px);
    padding: 2px 0;
  }

  .examples-glass-stack::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: -12px -20px;
    pointer-events: none;
    background: radial-gradient(circle at 48% 44%, rgba(72, 142, 145, 0.065), transparent 62%);
    filter: blur(26px);
    opacity: 0.42;
  }

  .examples-flow {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .example-case {
    position: relative;
    opacity: 0;
    animation: exampleCaseIn 460ms cubic-bezier(0.18, 0.78, 0.16, 1) forwards;
    animation-delay: calc(320ms + var(--case-index) * 90ms);
  }

  .case-body {
    position: relative;
    min-width: 0;
    min-height: 146px;
  }

  .case-cell {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 68px;
    min-width: 0;
  }

  .case-cell :global(.case-glass) {
    width: 100%;
    height: 100%;
  }

  .case-cell.is-result {
    left: auto;
    right: 3%;
    top: 88px;
    width: 42%;
    min-width: 118px;
    max-width: 178px;
    height: 54px;
  }

  .cell-content {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 6px;
    padding: 11px 18px;
  }

  .cell-label {
    align-self: flex-start;
    color: color-mix(in srgb, var(--theme-glow) 58%, var(--text-muted));
    font-size: 9px;
    font-weight: 850;
    letter-spacing: 1px;
    line-height: 1;
    text-transform: uppercase;
  }

  .case-cell.is-result .cell-content {
    align-items: flex-start;
    gap: 4px;
    padding: 7px 14px;
  }

  .case-cell.is-result .cell-label {
    align-self: flex-start;
    font-size: 8px;
  }

  .cell-value {
    min-width: 0;
    color: var(--text-main);
    font-size: 16px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .cell-value.is-blank {
    color: var(--text-muted);
  }

  .cell-value :global(code) {
    max-width: 100%;
    overflow-wrap: anywhere;
    color: var(--text-hot);
    font-family: var(--mono);
    font-size: 0.92em;
  }

  .case-cell.is-result .cell-value :global(code) {
    color: color-mix(in srgb, var(--theme-glow) 78%, #fff);
    text-shadow: 0 0 10px color-mix(in srgb, var(--theme-glow) 18%, transparent);
  }

  .cell-value :global(em) {
    color: var(--text-muted);
  }

  .case-arrow {
    position: absolute;
    z-index: 2;
    display: grid;
    left: 50%;
    right: auto;
    top: -19px;
    width: 12px;
    height: 18px;
    align-items: center;
    justify-content: center;
    color: color-mix(in srgb, var(--theme-glow) 42%, var(--text-muted));
    transform: translateX(-50%);
  }

  .case-arrow svg {
    width: 12px;
    height: 18px;
    opacity: 0.86;
  }

  .examples-prose {
    margin-top: 18px;
    color: var(--text-main);
    font-size: 16px;
    line-height: 1.55;
  }

  .examples-prose :global(p) {
    margin: 0 0 10px;
  }

  .examples-prose :global(code) {
    overflow-wrap: anywhere;
    padding: 3px 8px;
    border: 1px solid color-mix(in srgb, var(--theme-glow) 13%, transparent);
    border-radius: 7px;
    color: var(--text-hot);
    background: rgba(0, 10, 16, 0.7);
    font-family: var(--mono);
    font-size: 0.9em;
  }

  .examples-prose :global(em) {
    color: var(--text-muted);
  }

  .examples-empty {
    margin: 0;
    color: var(--text-muted);
  }

  .run-actions {
    position: absolute;
    z-index: 2;
    left: 0;
    bottom: 18px;
    width: min(100%, 560px);
    margin-top: 0;
    pointer-events: none;
    transform: scale(var(--detail-content-scale, 1));
    transform-origin: bottom left;
    transition: transform 480ms cubic-bezier(0.18, 0.78, 0.16, 1);
  }

  .run-buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .run-buttons :global(.run-button-glass) {
    flex: 0 0 auto;
    height: 34px;
    pointer-events: auto;
  }

  .run-button {
    width: 100%;
    height: 100%;
    padding: 0 12px;
    border: 0;
    border-radius: 13px;
    color: color-mix(in srgb, var(--theme-glow) 48%, var(--text-main));
    background: transparent;
    font-size: 12px;
    font-weight: 740;
    letter-spacing: 0.1px;
    white-space: nowrap;
    appearance: none;
    cursor: pointer;
    pointer-events: auto;
    transition:
      color 120ms ease,
      background 120ms ease,
      opacity 120ms ease;
  }

  .run-button:not(:disabled):hover {
    color: var(--text-hot);
    background: color-mix(in srgb, var(--theme-glow) 6%, transparent);
  }

  .run-button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 82%, transparent);
    outline-offset: -3px;
    background: color-mix(in srgb, var(--theme-glow) 7%, transparent);
  }

  .run-button:disabled {
    color: color-mix(in srgb, var(--text-muted) 66%, transparent);
    background: transparent;
    opacity: 0.56;
    cursor: not-allowed;
  }

  .run-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 11px 0 0;
    color: color-mix(in srgb, var(--theme-glow) 46%, var(--text-muted));
    font-size: 11px;
    font-weight: 720;
    letter-spacing: 0.45px;
  }

  .run-status i {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--theme-glow);
    box-shadow: 0 0 10px color-mix(in srgb, var(--theme-glow) 56%, transparent);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    border: 0;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes integratedDetailIn {
    from {
      opacity: 0;
      filter: blur(6px);
      transform: translate3d(56px, 0, 0);
    }
    to {
      opacity: 1;
      filter: blur(0);
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes integratedDetailOut {
    from {
      opacity: 1;
      filter: blur(0);
      transform: translate3d(0, 0, 0) scale(1);
    }
    to {
      opacity: 0;
      filter: blur(5px);
      transform: translate3d(38px, 0, 0) scale(0.985);
    }
  }

  @keyframes exampleCaseIn {
    from {
      opacity: 0;
      transform: translate3d(0, 14px, 0);
    }
    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .integrated-detail {
      opacity: 1;
      transform: none;
      animation: none;
    }

    .integrated-detail.is-exiting {
      opacity: 0;
    }

    .example-case {
      opacity: 1;
      animation: none;
    }

    .run-button {
      transition: none;
    }

    .run-actions {
      transition: none;
    }

  }

</style>
