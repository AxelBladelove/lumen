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
- prearma el commit de geometría al recibir `lumen.layoutCommitRequested`, sin
  habilitar todavía el reveal;
- al terminar la barra hace el punch-in al isotipo a pantalla completa, habilita
  el commit y emite `frontend.layoutHandoffReady` con `delayMs: 60`; el reloj
  vive en el Extension Host y la cortina sale sin fade en el primer resize real;
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
- un punch-in breve (180 ms) parte del lockup completo, toma como origen el
  centro óptico del isotipo y atraviesa el logo hasta `scale(48)`; el wordmark
  sale del viewport por geometría, no por un fade independiente, y el frame
  final queda cubierto por el azul interior de la propia marca. El isotipo
  pierde opacidad al ganar velocidad para que el último tramo se lea como
  arrastre, no como una ampliación nítida. Entre 24% y 72% aparecen dos copias
  RGB desplazadas, blur progresivo, skew alterno y un shake amortiguado de la
  cortina; todas desaparecen antes del estado final;
- si corre dentro del Extension Host, recibe `lumen.layoutCommitRequested`
  durante la carga, instala los observadores y responde
  `frontend.layoutCommitArmed`; al arrancar el punch-in recaptura la geometría,
  cambia la barrera a `enabled` y agenda el handoff en el Extension Host;
- el primer cambio real de ancho/alto aplica sincrónicamente
  `.lumen-layout-committed`, que elimina la cortina con `display: none` antes
  del paint del panel derecho. `lumen.layoutCommitted` sólo reevalúa la misma
  condición por si el resize ocurrió durante los comandos del host.

El gesto posterior al 100% debe quedar por debajo de un segundo en el camino
normal. No es una segunda espera ni un splash adicional: es el puente visual
entre los dos layouts.

El movimiento estructural sigue siendo compositor-first (`transform` y
`opacity`). Los efectos ópticos son capas efímeras aisladas: dos duplicados del
lockup con separación rojo/cian y `mix-blend-mode: screen`, más blur/saturación
del lockup y de la atmósfera. El fondo completo sólo recibe un shake de pocos
píxeles sobre `scale(1.012)`, de modo que nunca expone los bordes del viewport.
La curva acelera de forma exponencial y no tiene asentamiento antes del commit.

La segunda mitad empieza exactamente en el commit geométrico. La cortina se
retira con `display: none` y, ya dentro del panel final, `.lumen-route-app`
aterriza durante 160 ms desde `scale(1.11)` hasta su escala real. Esa mitad no
puede comenzar antes del resize: hacerlo transformaría la geometría fullscreen
dentro del panel estrecho. El par punch-in/zoom-out forma una sola transición
de aproximadamente 340 ms.

La invariante visual del commit es estricta: mientras la geometría sea la de
origen, la cortina fullscreen permanece cubierta por la marca —primero por el
lockup y después por el interior ampliado del isotipo—; no existe un estado
válido de fondo de carga desnudo. Cuando la geometría cambia, la cortina deja de
participar en layout/pintura en ese mismo callback. Un timeout nunca autoriza el
reveal. Si no existe resize observable, la entrada falla cerrada y el Extension
Host restaura el workspace.

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
