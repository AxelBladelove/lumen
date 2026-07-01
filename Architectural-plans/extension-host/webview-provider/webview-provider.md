# Webview Provider

Archivo: `Architectural-plans/extension-host/webview-provider/webview-provider.md`

## Proposito

`Webview Provider` documenta la pieza actual del Extension Host que sirve el
frontend de Lumen dentro de VS Code.

No define Lumen Mode completo ni el bridge hacia Local Engine. Su
responsabilidad es explicar como `LumenRoutePathViewProvider` crea la webview,
inyecta CSP, resuelve assets, recibe mensajes y guarda reportes de performance.

## Estado actual del repo

La implementacion vive en:

```txt
extension/src/extension.ts
extension/src/lumenRoutePathViewProvider.ts
extension/src/lumenEntry.ts
extension/src/lumenEntryState.ts
extension/src/lumenProtocol.ts
```

`extension.ts` registra:

- `LumenRoutePathViewProvider`;
- `lumen.open`;
- `lumen.enterMode`;
- `lumen.exitMode`;
- `lumen.refreshWebview`.

## Carga del Frontend

El provider busca:

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

Cuando la view se resuelve sin `entryState`, el provider activa:

```txt
lumen.inMode = true
lumen.mode = route
```

Luego envia `lumen.entry.state` con `phase: "mock-route-path-view"`.

Este comportamiento es temporal del mock. El layout completo de Lumen Mode
todavia no esta implementado.

## Perf Report

El provider acepta mensajes `perf.report`.

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

El provider sirve solo `lumen.routePath`.

El provider no compila ejercicios.

El provider no decide progreso.

El provider no ejecuta Local Engine.

El provider si es responsable de CSP, bootstrap, fallback de build y mensajes
webview.

`perf.report` debe seguir siendo diagnostico local, no producto final.

## Resultado Esperado

La extension puede abrir una webview segura con el frontend empaquetado.

Si falta el build, el usuario recibe una instruccion clara.

Si la webview reporta performance, el Extension Host conserva evidencia local
para depurar tiempos reales dentro de VS Code.
