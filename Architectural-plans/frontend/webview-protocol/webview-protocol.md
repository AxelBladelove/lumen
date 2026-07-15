# Webview Protocol

Archivo: `Architectural-plans/frontend/webview-protocol/webview-protocol.md`

## Proposito

`Webview Protocol` documenta el contrato actual entre el frontend Svelte y el
Extension Host.

Este documento no define el bridge completo hacia Local Engine. Solo describe
los mensajes que existen hoy entre `frontend/src/webview/messages.ts`,
`frontend/src/webview/vscodeBridge.ts` y
`extension/src/lumenWebviewHost.ts`, con el panel principal controlado por
`extension/src/lumenPanel.ts`.

## Estado actual del repo

El protocolo actual tiene version:

```txt
lumenWebviewProtocolVersion = 5
```

La versión 5 convierte el handoff en un protocolo correlacionado por token y
añade una barrera post-paint antes de que VS Code mueva el panel. Reemplaza la
autoridad geométrica de la versión 4: el resize queda como telemetría y no puede
revelar la UI. Convive con Engine Protocol v6; son versiones
independientes. El slice Route Loop ya transporta snapshots reales
y acciones de activación, aunque mantiene mensajes de entrada y performance
del slice visual original.

El bridge del frontend usa `window.acquireVsCodeApi()` cuando corre dentro de
VS Code. En navegador normal, `post()` no hace nada porque no hay API de VS
Code disponible.

## Mensajes Webview -> Extension Host

### `frontend.ready`

Indica que la app Svelte ya monto la vista inicial.

Payload actual:

```txt
protocolVersion
view
routeId
moduleId
dataSource
```

La extension responde con `extension.ready` y reenvia `lumen.entry.state` si
ya lo tiene.

### `frontend.layoutHandoffReady`

Se emite una vez por ciclo cuando la barra ya llegó a 100, la ruta rindió y
arranca el punch-in a pantalla completa. El Extension Host cronometra el delay;
el throttling de Chromium no puede introducir una pausa de ~1 segundo. Al
cumplirse todavía no mueve el panel: primero solicita la superficie segura.

Payload actual:

```txt
delayMs = 88
token: string
```

El token debe coincidir con el enviado en `lumen.layoutCommitRequested`. Al
cumplirse el delay, el host envía `lumen.layoutHandoffPrepare { token }`.

### `frontend.layoutCommitArmed`

Confirma que la webview aceptó el token del ciclo. Se emite durante la carga,
antes del punch-in, y no habilita el reveal por sí sola. El host debe esperarla
antes de esperar `frontend.layoutHandoffReady`.

Payload:

```txt
token: string
```

### `frontend.layoutHandoffPrepared`

Confirma que el frontend retiró ambas capas del intro, congeló la ruta en el
primer frame del landing y esperó dos `requestAnimationFrame`. Por tanto ya
existe una superficie webview intro-free que el compositor puede reutilizar sin
mostrar el logo ampliado.

Payload:

```txt
token: string
```

El host sólo puede mover `lumen.routePathPanel` después de esta señal y si el
token coincide con el ciclo activo.

### `frontend.revealed`

Se emite una sola vez por ciclo de intro, cuando la cortina de entrada terminó
de ocultarse: la ruta ya está visible en el layout final y no quedan módulos
cargando. Incluye el token activo (o `null` fuera del Extension Host); el panel
sólo acepta la señal si coincide con un handoff preparado.

El Extension Host la usa como confirmacion de que el fade final termino antes
de marcar la sesion como activa.

### `route.node.selected`

Se emite cuando el usuario selecciona un nodo visual de la ruta.

Payload actual:

```txt
nodeId
status
nodeType
```

El Extension Host trata este mensaje como intención. Para nodos `active` o
`completed` solicita `exercise.activate`, abre el `entrypointPath` de la
working copy y publica datos frescos. Un nodo `locked` no se activa; el engine
mantiene la misma regla si recibe una llamada directa.

### `route.continue.requested`

Se emite cuando el usuario presiona continuar.

Payload actual:

```txt
fromNodeId
nextNodeId
```

El Extension Host no confía en `nextNodeId`: consulta un snapshot fresco y
activa su `activeExerciseId`. La webview no cambia progreso por anticipado.

### `exercise.detail.requested`

Se emite cuando la webview necesita el detalle de un ejercicio concreto (por
ejemplo al revisar un nodo completado).

```txt
exerciseId
```

Es una intención: el Extension Host llama `exercise.getDetail` y responde con
`exercise.detail.data`. La webview no debe pedir detalles de nodos bloqueados.

### `lumen.exit.requested`

Se emite cuando el usuario presiona `Escape` con el foco dentro de la webview
y no hay superficies temporales abiertas (el panel de enunciado se cierra
primero).

Payload vacio.

El Extension Host lo traduce a `lumen.exitMode`. Existe porque VS Code no
evalua de forma fiable keybindings de extension mientras el foco esta dentro
de la webview; asi tecla y comando comparten la misma logica de salida.

### `perf.report`

Mensaje de instrumentacion local.

Payload actual:

```txt
label
navigation
marks
measures
frameStats
webglStats
routePresent
canvasPresent
nodeCount
visibilityState
hasFocus
```

La extension lo escribe en `.lumen-perf/vscode-webview.jsonl`.

## Mensajes Extension Host -> Webview

### `extension.ready`

Confirma que el Extension Host recibio `frontend.ready`.

Payload actual:

```txt
protocolVersion
mode: "mock"
message
```

### `lumen.entry.state`

Informa el estado de entrada de Lumen Mode. El nombre de fase conserva por
compatibilidad el literal histórico `mock-route-path-view`, aunque el módulo
puede recibir datos reales del engine.

Incluye:

```txt
protocolVersion
inMode
mode: "route"
phase: "mock-route-path-view"
workspace.action
```

El estado de workspace puede ser:

```txt
ready
workspace-switch-pending
workspace-missing
```

### `lumen.entry.transition`

Informa la fase visual de entrada de Lumen Mode.

Payload actual:

```txt
phase: entering | active
```

Cuando `phase` es `entering`, el frontend reinicia la pantalla de carga con
logo, wordmark y barra de progreso aunque la webview haya quedado retenida por
VS Code desde una entrada anterior. Esto permite cubrir el reacomodo de Zen
Mode y del grupo de editor derecho sin recargar toda la webview.

### `lumen.layoutCommitRequested`

Solicita al frontend armar el ciclo mientras la cortina aún está fullscreen. No
mueve ni revela nada por sí solo. Incluye un token único; la respuesta
obligatoria es `frontend.layoutCommitArmed { token }`. El host lo envía
inmediatamente después de `frontend.ready`, no después del punch-in.

### `lumen.layoutHandoffPrepare`

Ordena al frontend preparar la superficie segura asociada al token. En el mismo
task se aplica `.lumen-ui-handoff-frozen`, se retiran intro estático y Svelte y
se esperan dos oportunidades completas de pintura mediante tres callbacks rAF.
La respuesta obligatoria es
`frontend.layoutHandoffPrepared { token }`. Este mensaje no mueve el panel ni
arranca todavía el zoom-out.

### `lumen.layoutCommitted`

Confirma que el host terminó el layout final. Sólo se acepta desde el estado
`safe` y con el token activo. El frontend conserva
`.lumen-ui-handoff-frozen` hasta el siguiente frame del renderer, lo cambia por
`.lumen-ui-entering` e inicia el zoom-out de 160 ms. `frontend.revealed` se
emite al asentarse el landing. La geometría no es una precondición: esto cubre
movimientos entre grupos del mismo tamaño.

### `route.module.snapshot`

Permite reemplazar el módulo visual completo. Se conserva para fallback,
harness y compatibilidad con el slice anterior.

### `route.module.data`

Proyecta el snapshot del engine sin exigir que Extension Host construya todo
el modelo visual:

```txt
source: "engine"
routeId
moduleId
activeExerciseId
nodes[]: exerciseId, title, primaryTopics, nodeType, orderInModule, status
```

Los estados `completed`, `active` y `locked` se renderizan sin progresión
local alternativa.

### `route.activation.state`

Comunica el estado transitorio de una activación:

```txt
busy: { exerciseId } | null
error: { exerciseId?, message } | null
```

Sirve para feedback de UI; no es una fuente de progreso.

### `exercise.detail.data`

Publica el detalle del ejercicio para el panel derecho (Engine Protocol v6):

```txt
source: "engine"
detail: ExerciseDetailPayload | null
```

`detail` incluye enunciado markdown, hints ordenados, dificultad, estado y
progreso. Se publica tras cada `route.module.data` (detail del
`activeExerciseId` o `null`) y como respuesta a `exercise.detail.requested`.
La webview lo renderiza con su propio subset de markdown con escape total de
HTML; el shape normativo vive en
`Architectural-plans/extension-engine-bridge/protocol-v6.md`.

### `route.exercise.completed`

Permite disparar la finalizacion del ejercicio activo desde afuera del
frontend.

Hoy se traduce a un evento DOM `lumen:exercise-completed`.

## Reglas Deterministas

Todo mensaje importante debe tener `type`.

El frontend no debe asumir que `acquireVsCodeApi` existe.

El protocolo frontend-host actual es version 5 y está parcialmente integrado
con Engine Protocol v6.

`perf.report` es instrumentacion local, no parte del producto pedagogico.

El Local Engine futuro debe entrar detras del Extension Host, no directo desde
la webview.

## Resultado Esperado

Frontend y Extension Host tienen un contrato pequeno, tipado y facil de
inspeccionar.

La vista puede funcionar en navegador con datos fallback. Dentro de la
extension recibe estado real, solicita activación y reporta performance.
