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

`main.ts` limpia solamente el fallback de `#app` y monta `App.svelte`. La
cortina estatica es hermana de `#app`, permanece por encima con `z-index: 200`
y conserva el control visual hasta que Svelte inicia el punch-in con el layout
ya estabilizado.

`App.svelte`:

- crea el bridge de VS Code;
- carga el modulo mock de ruta;
- envia `frontend.ready`;
- recibe `route.module.snapshot` y `route.exercise.completed`;
- renderiza `RoutePathView`;
- muestra la pantalla de entrada de Lumen encima de la ruta;
- precarga logo y wordmark;
- decide cuando esconder el intro;
- prearma el ciclo al recibir `lumen.layoutCommitRequested { token }`, sin
  habilitar todavía el reveal;
- al terminar la barra hace el punch-in al isotipo a pantalla completa y emite
  `frontend.layoutHandoffReady { delayMs: 88, token }`; el reloj vive en el
  Extension Host;
- al recibir `lumen.layoutHandoffPrepare { token }`, sustituye ambas cortinas
  por la ruta congelada en `scale(1.11)`, espera dos frames y responde
  `frontend.layoutHandoffPrepared { token }`. Sólo entonces el host puede mover
  el panel;
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

Logo y wordmark del HTML compilado se incrustan como `data:` URI: la primera
pintura de la cortina no depende de una segunda lectura. El lockup está visible
desde ese primer frame, sin fade de entrada. La cortina estática continúa
actualizando la barra mientras carga el bundle; Svelte lee el porcentaje justo
en el relevo y prepara su propio lockup debajo, en exactamente la misma opacidad,
posición y escala, sin una segunda animación de entrada. La capa HTML permanece
por encima durante todos los resizes y recibe el porcentaje real de Svelte hasta
100; sólo se elimina un frame después de arrancar el punch-in, ya con el layout
estable. Por ello no puede aparecer fondo desnudo, marca tenue ni retroceder el
contador durante el montaje.

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
  durante la carga, conserva su token y responde
  `frontend.layoutCommitArmed { token }`; al arrancar el punch-in agenda el
  handoff en el reloj del Extension Host;
- al cumplirse el delay, el host envía `lumen.layoutHandoffPrepare { token }`.
  El frontend aplica `.lumen-ui-handoff-frozen`, retira de forma síncrona tanto
  el intro HTML como el de Svelte y encadena tres `requestAnimationFrame`. El
  ack sale en el tercero, después de dos oportunidades completas de pintura
  intro-free; entonces emite `frontend.layoutHandoffPrepared { token }`;
- el host mueve el panel únicamente después de esa confirmación. Cualquier
  textura atrasada que el compositor reutilice ya contiene la ruta válida en el
  primer frame del landing. `lumen.layoutCommitted { token }` conserva frozen
  hasta el siguiente frame del renderer y sólo allí lo intercambia por
  `.lumen-ui-entering`. `frontend.revealed` se emite al asentarse los 160 ms. La
  geometría se mide sólo para telemetría: ni un resize arbitrario ni la falta de
  resize gobiernan el estado visual.

El gesto posterior al 100% debe quedar por debajo de un segundo en el camino
normal. No es una segunda espera ni un splash adicional: es el puente visual
entre los dos layouts.

El movimiento estructural sigue siendo compositor-first (`transform` y
`opacity`). Los efectos ópticos son capas efímeras aisladas: dos duplicados del
lockup con separación rojo/cian y `mix-blend-mode: screen`, más blur/saturación
del lockup y de la atmósfera. El fondo completo sólo recibe un shake de pocos
píxeles sobre `scale(1.012)`, de modo que nunca expone los bordes del viewport.
La curva acelera de forma exponencial y no tiene asentamiento antes del commit.

La segunda mitad se prepara antes del movimiento como una superficie congelada.
`.lumen-route-app` ya está en `opacity: 0.86` y `scale(1.11)` cuando el host
recibe el ack post-paint; después del movimiento, el token de commit arma en el
siguiente frame un landing de 160 ms hasta la escala real. El estado inicial de
la preparación y el keyframe inicial son idénticos, por lo que no existe salto
óptico. El lock del grupo se lanza como trabajo best-effort en paralelo con el
landing: no forma parte de la barrera de activación ni puede añadir una espera
visual. Tras `frontend.revealed`, el host vuelve a comprobar el token y la vida
del panel en el mismo turno en que activa la sesión.

La invariante visual del commit es estricta: antes de mover el panel existe una
superficie webview confirmada que no contiene ningún nodo del intro. Por ello el
split final nunca puede coincidir con el lockup ampliado, aunque el workbench
recomponga una textura anterior a la confirmación del host. Sólo el mismo token
puede avanzar `armed -> scheduled -> preparing -> safe -> committing ->
committed -> settled`; mensajes atrasados, resizes o movimientos entre grupos
de igual tamaño no alteran la secuencia. Si falta cualquier ack, la entrada
falla cerrada y restaura el workspace.

La API de VS Code no expone un fence de presentación del compositor externo.
Por tanto, el protocolo garantiza que las superficies producidas por Chromium
durante dos ciclos completos previos al movimiento son intro-free, pero la
elección final de textura del workbench debe comprobarse empíricamente con
captura frame a frame en VS Code real. La PR no sale de draft sin esa prueba.

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
lumen:layout-handoff-prepare-start
lumen:layout-handoff-safe-frame-painted
lumen:layout-commit-applied
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
