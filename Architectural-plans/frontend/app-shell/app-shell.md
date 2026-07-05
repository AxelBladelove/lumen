# App Shell

Archivo: `Architectural-plans/frontend/app-shell/app-shell.md`

## Proposito

`App Shell` documenta la raiz actual del frontend de Lumen dentro de la
webview.

No define Route Mode completo, Local Engine, compilacion ni Ask Tutor. Su
responsabilidad es explicar como `frontend/src/App.svelte` monta el mock de
Route Path View, coordina la pantalla de entrada, reporta performance y habla
con el Extension Host.

## Estado actual del repo

La implementacion actual vive en:

```txt
frontend/src/main.ts
frontend/src/App.svelte
frontend/src/app.css
frontend/src/brand/lumenBrand.ts
frontend/src/webview/messages.ts
frontend/src/webview/vscodeBridge.ts
```

`main.ts` limpia el HTML estatico inicial con `target.replaceChildren()` y
monta `App.svelte`.

`App.svelte`:

- crea el bridge de VS Code;
- carga el modulo mock de ruta;
- envia `frontend.ready`;
- recibe `route.module.snapshot` y `route.exercise.completed`;
- renderiza `RoutePathView`;
- muestra la pantalla de entrada de Lumen encima de la ruta;
- precarga logo y wordmark;
- decide cuando esconder el intro;
- en VS Code espera `lumen.reveal` antes de correr el fade final, despues de
  emitir `frontend.loadingComplete`;
- emite reportes `perf.report`.

## Pantalla de entrada

El intro actual usa:

```txt
assets/brand/lumen-logo.svg
assets/brand/lumen-wordmark.webp
```

La pantalla no es el flujo final de bienvenida de Lumen Mode. Es una capa
visual local del mock para cubrir el handoff entre el HTML estatico inicial,
Svelte, los assets principales y el primer render estable de la ruta.

El intro se mantiene visible hasta que:

- los assets de marca estan listos o vence un fallback corto;
- la ruta marca `lumen:route-visual-complete`;
- la barra visual de progreso completa su animacion;
- si corre dentro del Extension Host, llega `lumen.reveal` confirmando que el
  panel ya esta en el layout final.

Si la URL contiene `lumenPerfHoldIntro`, el intro se mantiene para capturas de
performance visual.

## Performance Marks

`App.svelte` registra y consume marcas de performance.

Marcas principales:

```txt
lumen:app-mounted
lumen:route-visual-complete
lumen:route-interactive
lumen:intro-exit-start
lumen:intro-hidden
```

Medidas principales:

```txt
lumen:route-render-to-visual-complete
lumen:route-render-to-interactive
```

Estas marcas son parte del harness local de performance. No deben confundirse
con reglas de producto.

## Reportes a la Extension

`setupPerfReporting()` envia mensajes `perf.report` al Extension Host con:

- timing de navegacion;
- marks y measures;
- estadisticas de frames;
- `window.__LUMEN_WEBGL_STATS__`;
- presencia de route stage, canvas y nodos;
- estado de foco y visibilidad.

El Extension Host guarda esos reportes en `.lumen-perf/vscode-webview.jsonl`.

## Relacion con Route Path View

App Shell no decide progreso real. Solo mantiene estado local del mock y
reenvia eventos:

```txt
route.node.selected
route.continue.requested
route.exercise.completed
```

Cuando exista Local Engine, `App.svelte` debe dejar de ser la fuente primaria
del modulo visible y pasar a renderizar snapshots reales.

## Reglas Deterministas

App Shell monta una sola vista: Route Path View mockeada.

App Shell envia `frontend.ready` al iniciar.

App Shell no habla con Local Engine directamente.

App Shell puede medir performance local, pero no decide reglas de producto.

El intro usa marca de Lumen, no colores del modulo.

Los flags de URL `lumenPerfHoldIntro` y `lumenPerfVisual` existen para pruebas,
no para usuarios finales.

## Resultado Esperado

La webview puede abrir una experiencia visual coherente aunque todavia no haya
engine real.

La extension recibe senales suficientes para saber que el frontend esta vivo.

Los scripts de performance pueden medir carga, frames, WebGL y estados
visuales sin mezclar esa logica con el producto final.
