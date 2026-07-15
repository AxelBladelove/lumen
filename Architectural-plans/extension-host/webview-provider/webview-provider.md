# Webview Provider

Archivo: `Architectural-plans/extension-host/webview-provider/webview-provider.md`

## Proposito

`Webview Provider` documenta la pieza actual del Extension Host que sirve el
frontend de Lumen dentro de VS Code.

No define Lumen Mode completo ni el bridge hacia Local Engine. Su
responsabilidad es explicar como el Extension Host sirve el frontend en una
webview, inyecta CSP, resuelve assets, recibe mensajes y guarda reportes de
performance.

## Estado actual del repo

La implementacion vive en:

```txt
extension/src/extension.ts
extension/src/lumenPanel.ts
extension/src/lumenRoutePathViewProvider.ts
extension/src/lumenWebviewHost.ts
extension/src/lumenWebviewContent.ts
extension/src/lumenLayout.ts
extension/src/lumenEntry.ts
extension/src/lumenEntryState.ts
extension/src/lumenProtocol.ts
```

La entrada de Lumen sigue siendo la Webview View `lumen.routePath` del
Activity Bar, servida por `LumenRoutePathViewProvider`, pero esa vista es solo
un launcher liviano. No renderiza el frontend completo: cuando se hace visible
por el gesto del usuario, cierra el sidebar y dispara `lumen.enterMode`.

La superficie real de Lumen es el `WebviewPanel` de editor
`lumen.routePathPanel`, controlado por `LumenPanelController`. Su HTML se
precarga al activar la extensión y el panel se crea a pantalla completa en el
grupo activo (el HTML incluye la cortina estática de entrada), usa
`retainContextWhenHidden: true` y sirve el frontend completo sin el header
nativo del sidebar. El controlador arma un watchdog de boot
(reintenta el HTML una vez si `frontend.ready` no llega en 5s) y expone
  señales `frontend.ready`, `frontend.layoutCommitArmed`,
  `frontend.layoutHandoffReady`, `frontend.layoutHandoffPrepared` y
  `frontend.revealed`. `lumenEntry.ts` correlaciona las fases con un token,
  espera una superficie intro-free post-paint y sólo entonces mueve el panel.
  `lumen.layoutCommitted` arranca el landing antes de activar la sesión.

Detalle de robustez: dentro de `onDidDispose` no debe leerse `panel.webview`
(el getter lanza "Webview is disposed"); el controlador captura la referencia
del webview al crear el panel y limpia estado con esa referencia. Un throw ahí
dejaba un panel fantasma que rompía todas las entradas siguientes.

`lumenWebviewHost.ts` contiene la logica compartida de mensajes, estado de
entrada, fases, handshake de revelado y reportes de performance para el
webview que ejecuta el frontend.

`lumenWebviewContent.ts` contiene la construccion de HTML/CSP/nonce, la
inyeccion de `<base>`, favicon, bootstrap de protocolo y fallback cuando falta
`frontend/dist/index.html`.

`extension.ts` registra el provider, mas `lumen.open`, `lumen.enterMode`,
`lumen.exitMode`, `lumen.engineStatus`, `lumen.refreshWebview` y
`lumen.compileCurrentExercise`.

## Carga del Frontend

El panel busca:

```txt
frontend/dist/index.html
```

Si existe, prepara el HTML para webview:

- agrega `<base href="...">`;
- agrega Content Security Policy;
- agrega favicon de Lumen;
- inyecta `window.__LUMEN_WEBVIEW_BOOTSTRAP__`;
- agrega nonce a scripts sin nonce.

Si no existe, devuelve una pagina minima en espanol indicando que hay que
ejecutar `bun run build`.

## Local Resource Roots

La webview permite recursos locales desde:

```txt
frontend/dist
assets
```

Esto permite que el frontend empaquetado use assets de build y que el provider
use el logo oficial para favicon/fallback.

## CSP

La politica actual:

```txt
default-src 'none'
img-src webview data: blob:
font-src webview
style-src webview 'unsafe-inline'
script-src webview nonce
connect-src webview
worker-src blob:
```

La regla importante es que el HTML construido debe correr dentro de VS Code sin
abrir acceso arbitrario.

## Estado de Entrada

El estado de entrada lo fija `lumen.enterMode` (ver `enter-lumen-mode.md`): el
panel recibe `lumen.entry.state` con `phase: "mock-route-path-view"` al crearse
y en cada `frontend.ready`.

El handshake de entrada actual es:

```txt
frontend.ready -> extension.ready + estado/fase
lumen.layoutCommitRequested { token } -> frontend.layoutCommitArmed { token }
barra 100 -> zoom-in fullscreen al wordmark
frontend.layoutHandoffReady { delayMs: 88, token } -> reloj del Extension Host
delay cumplido -> lumen.layoutHandoffPrepare { token }
doble rAF intro-free -> frontend.layoutHandoffPrepared { token }
mover panel al grupo derecho; iniciar lock no visual
lumen.layoutCommitted { token } -> zoom-out de la UI final
frontend.revealed -> la extension marca la sesion activa
```

## Perf Report

El host de webview acepta mensajes `perf.report`.

Cada reporte se escribe como JSONL en:

```txt
.lumen-perf/vscode-webview.jsonl
```

El archivo vive bajo `context.extensionUri`, es decir, dentro de la copia de la
extension que esta ejecutando VS Code. En desarrollo local puede ser el repo o
la extension instalada, segun como se haya abierto.

Los reportes `steady-frame-sample` tambien se resumen en el output channel
`Lumen`.

## Reglas Deterministas

El frontend completo se sirve en el panel `lumen.routePathPanel`.

El provider/host no compila ejercicios.

El provider/host no decide progreso.

El provider/host no ejecuta Local Engine.

El panel y el host si son responsables de CSP, bootstrap, fallback de build y
mensajes webview. El launcher del Activity Bar solo inicia la entrada.

`perf.report` debe seguir siendo diagnostico local, no producto final.

## Resultado Esperado

La extension puede abrir una webview segura con el frontend empaquetado.

Si falta el build, el usuario recibe una instruccion clara.

Si la webview reporta performance, el Extension Host conserva evidencia local
para depurar tiempos reales dentro de VS Code.
