# Performance Harness

Archivo: `Architectural-plans/performance/performance-harness.md`

## Proposito

`Performance Harness` documenta las herramientas locales para medir carga,
estabilidad visual y regresiones de Route Path View.

No es un modulo de producto. No define UX final ni reglas pedagogicas. Es una
capa de verificacion para el objetivo performance-first de Lumen.

## Estado actual del repo

Las herramientas actuales viven en:

```txt
scripts/perf-harness.mjs
scripts/measure-page-load.mjs
scripts/measure-vscode-webview.mjs
perf/baselines/visual/
perf/results/
perf/visual/
.lumen-perf/
```

`perf/` contiene resultados y capturas generadas por el harness. `.lumen-perf/`
contiene reportes JSONL emitidos desde la webview real de VS Code.

## Scripts

### `perf-harness.mjs`

Ejecuta Vite preview, abre Chromium por CDP y mide estados concretos de
Route Path View:

```txt
loading-screen
main-path-module
completed-node-review
node-to-node-transition
```

Tambien captura screenshots, compara contra baselines PNG y escribe resumen
JSON/Markdown en `perf/results`.

### `measure-page-load.mjs`

Mide una pagina servida en navegador usando Chromium CDP. Es util para
iteraciones rapidas fuera de VS Code.

### `measure-vscode-webview.mjs`

Se conecta a un target CDP de VS Code y mide la webview real del panel de
editor `lumen.routePathPanel`. El script detecta el target por contenido
observable de Lumen, no por el id del panel. Los reportes JSONL siguen
escribiendo `viewType: "lumen.routePath"` por compatibilidad con resultados y
harnesses previos.

## Scripts de package.json

```txt
bun run perf:harness
bun run perf:smoke
bun run perf:baseline
```

`perf:smoke` reduce warmups/iteraciones para una verificacion rapida.

`perf:baseline` aumenta warmups/iteraciones para una medicion mas estable.

## Variables de Entorno

Variables principales:

```txt
CHROME_PATH
PERF_CDP_PORT
PERF_PREVIEW_PORT
PERF_ORIGIN
PERF_ITERATIONS
PERF_WARMUPS
PERF_WIDTH
PERF_HEIGHT
PERF_DSF
PERF_VISUAL_THRESHOLD
PERF_VISUAL_CHANNEL_THRESHOLD
PERF_KEEP_PREVIEW
```

Para VS Code webview:

```txt
VSCODE_CDP_PORT
VSCODE_PERF_ITERATIONS
VSCODE_PERF_WARMUPS
VSCODE_WEBVIEW_TARGET
```

## Flags de URL

El harness usa flags de URL que el frontend reconoce:

```txt
lumenPerfVisual
lumenPerfHoldIntro
```

`lumenPerfVisual` congela tiempo visual del snake para screenshots mas
deterministas.

`lumenPerfHoldIntro` mantiene la pantalla de entrada visible para capturar el
estado loading.

## Resultados

Los resultados markdown resumen:

- condiciones de ejecucion;
- commit medido;
- viewport;
- warmups e iteraciones;
- p95 y mediana por estado;
- resultado de regresion visual;
- rutas de screenshots.

Las capturas nuevas se escriben en:

```txt
perf/visual/<timestamp>/
```

Los baselines viven en:

```txt
perf/baselines/visual/
```

## Reglas Deterministas

El harness debe medir estados observables, no intenciones.

Los screenshots deben poder compararse con baselines.

Las marcas de performance del frontend son contrato de diagnostico.

Los resultados de `perf/` no reemplazan pruebas unitarias ni verificacion
manual de UX.

El objetivo `<50ms` debe aclarar si se refiere a timing de navegacion,
visual-complete o sensacion end-to-end.

## Resultado Esperado

El equipo puede correr una medicion repetible del mock visual.

Puede detectar si una optimizacion mejora carga real o solo mueve trabajo a
otro momento.

Puede conservar evidencia visual y numerica de regresiones en Route Path View.
