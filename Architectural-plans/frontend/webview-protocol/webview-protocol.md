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
lumenWebviewProtocolVersion = 1
```

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

### `frontend.loadingComplete`

Se emite una vez por ciclo de intro cuando la barra llega a 100 y la ruta ya
rindio lo suficiente para mostrar la UI, pero la cortina de entrada sigue a
pantalla completa.

Payload vacio.

El Extension Host la usa como punto seguro para ejecutar el unico cambio de
layout de la entrada: mover `lumen.routePathPanel` al grupo derecho, ajustar la
proporcion de grupos y bloquear el grupo de Lumen si quedo solo. Mutar el
layout de editores antes de esta señal puede interrumpir la carga de modulos
del webview.

### `frontend.revealed`

Se emite una sola vez por ciclo de intro, cuando la cortina de entrada termino
de ocultarse: la ruta ya esta visible en el layout final y no quedan modulos
cargando.

Payload vacio.

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

Hoy solo se registra en el output channel `Lumen`.

### `route.continue.requested`

Se emite cuando el usuario presiona continuar.

Payload actual:

```txt
fromNodeId
nextNodeId
```

Hoy no avanza el engine. La ruta ya avanzo localmente en el frontend mock y el
mensaje queda como telemetria/contrato futuro.

### `lumen.exit.requested`

Se emite cuando el usuario presiona `Escape` con el foco dentro de la webview.

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

Informa el estado de entrada de Lumen Mode mock.

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

### `lumen.reveal`

Indica que el layout final ya quedo colocado detras de la cortina. El frontend
usa este mensaje para liberar el fade de salida del intro; asi la UI aparece
directamente en editor-izquierda + Lumen-derecha, sin un frame intermedio del
modulo a pantalla completa.

### `route.module.snapshot`

Permite reemplazar el modulo visible desde la extension.

Hoy el frontend soporta el mensaje, pero el provider actual no lo produce
desde un engine real.

### `route.exercise.completed`

Permite disparar la finalizacion del ejercicio activo desde afuera del
frontend.

Hoy se traduce a un evento DOM `lumen:exercise-completed`.

## Reglas Deterministas

Todo mensaje importante debe tener `type`.

El frontend no debe asumir que `acquireVsCodeApi` existe.

El protocolo actual es mock y version 1.

`perf.report` es instrumentacion local, no parte del producto pedagogico.

El Local Engine futuro debe entrar detras del Extension Host, no directo desde
la webview.

## Resultado Esperado

Frontend y Extension Host tienen un contrato pequeno, tipado y facil de
inspeccionar.

La vista mock puede funcionar en navegador sin VS Code, pero cuando corre
dentro de la extension puede reportar estado, interaccion y performance.
