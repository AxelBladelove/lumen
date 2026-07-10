# Lumen

Lumen es, en este estado del repo, una extension de VS Code que empaqueta un
frontend Svelte/Vite dentro de un `WebviewPanel` de editor.

El slice implementado es un mock visual de `Ruta C / Modulo 2: Cadenas de
caracteres`. Sirve para validar la experiencia de Route Path View, el snake
WebGL, la pantalla de entrada, el pipeline de build y la medicion de
performance.

## Implementacion Actual

- Paquete raiz de la extension: `package.json`.
- Entry point de la extension: `extension/src/extension.ts`.
- Local Engine (binario Rust): `engine/`.
- Bridge extension <-> engine: `extension/src/engine/lumenEngineClient.ts`.
- Tipos del protocolo engine: `extension/src/engine/lumenEngineProtocol.ts`.
- Secuencia de entrada/salida: `extension/src/lumenEntry.ts`.
- Layout enfocado de VS Code: `extension/src/lumenLayout.ts`.
- Panel principal de editor: `extension/src/lumenPanel.ts`.
- Host de mensajes webview: `extension/src/lumenWebviewHost.ts`.
- HTML/CSP de la webview: `extension/src/lumenWebviewContent.ts`.
- Launcher del Activity Bar: `extension/src/lumenRoutePathViewProvider.ts`.
- Estado de entrada/workspace: `extension/src/lumenEntryState.ts`.
- App frontend: `frontend/src/App.svelte`.
- Vista de ruta: `frontend/src/route-path-view/RoutePathView.svelte`.
- Renderer WebGL del snake: `frontend/src/webgl-snake/WebGLSnake.svelte`.
- Datos mock de ruta: `frontend/src/route-path-view/data/mockRouteModule.ts`.
- Assets de marca: `assets/brand/`.
- Scripts de performance e instalacion local: `scripts/`.

La extension contribuye el contenedor de Activity Bar `Lumen` y la vista
`lumen.routePath`, pero esa vista ya no renderiza la UI principal: funciona
como launcher liviano. Al hacer click en el icono, la extension cierra el
sidebar, entra a Lumen Mode, crea el panel `lumen.routePathPanel` a pantalla
completa, activa Zen Mode y, cuando el frontend termina su carga detras de la
cortina, mueve el panel al grupo derecho. Los comandos disponibles son:

```txt
lumen.open
lumen.enterMode
lumen.exitMode
lumen.refreshWebview
lumen.engineStatus
lumen.compileCurrentExercise
```

## Local Engine

`engine/` contiene el Local Engine: un binario Rust (`lumen-engine`) que habla
NDJSON por stdio con el Extension Host y persiste estado en SQLite (`lumen.db`
bajo el globalStorage de la extension), con migraciones versionadas. El
contrato normativo es
`Architectural-plans/extension-engine-bridge/protocol-v2.md` (protocolo v2:
`engine.healthCheck`, `session.getLastState`, `session.saveLastState`,
`exercise.compile`, `toolchain.check`).

El flujo de compilacion `F9` esta implementado como slice transicional: la
extension resuelve el archivo `.c` activo y llama `exercise.compile`; el
engine descubre GCC (PATH o MSYS2), compila con `-Wall -Wextra -g` a
`.lumen-build/`, devuelve diagnosticos estructurados y registra el intento en
`compile_attempts`. Con exito se abre una consola externa de Windows; con
errores se muestra la terminal integrada `Lumen Compile` (errores en rojo,
warnings en azul). Orquestacion en `extension/src/lumenCompile.ts`.

La extension lanza el binario de forma lazy mediante
`extension/src/engine/lumenEngineClient.ts`, hace un health check al activar y
expone `lumen.engineStatus` para inspeccionarlo. En desarrollo el cliente busca
el binario en `engine/target/{release,debug}`; en la copia instalada, en
`bin/lumen-engine.exe` (sincronizado por `install:local`).

Todavia no existen Cloudflare backend, Ask Tutor ni coleccion de ejercicios
empaquetada. El engine aun no gestiona ejercicios (bloqueos, importacion,
metadata): la resolucion del ejercicio activo es transicional via el editor.

## Desarrollo

Instala dependencias con Bun y compila frontend + extension:

```txt
bun install
bun run build
```

Scripts principales:

```txt
bun run dev:frontend
bun run build:frontend
bun run compile:extension
bun run build:engine
bun run build
bun run build:local
```

`build:engine` requiere el toolchain de Rust (`cargo`). Los tests del engine
corren con `cargo test` desde `engine/`.

`build:local` compila el repo y sincroniza `extension/out`, `frontend/dist`,
`assets` y `package.json` dentro de la copia instalada en
`~/.vscode/extensions/lumen.lumen-0.0.1`. Despues de correrlo, VS Code debe
recargarse con `Developer: Reload Window` para tomar la nueva copia.

## Build de la Webview

El panel lee `frontend/dist/index.html` mediante `lumenWebviewContent.ts`. Si
el frontend no fue compilado, la extension muestra una pagina minima que pide
ejecutar `bun run build`.

El build de Vite usa `base: "./"` para funcionar dentro de la webview. Los
plugins locales:

- eliminan PNG source de `dist` cuando existen assets runtime `.webp`;
- reemplazan el entry module por un bootstrap inline que importa el bundle
  principal desde el HTML;
- reemplazan el CSS por `window.__LUMEN_LOAD_STYLES__`, un loader diferido de
  stylesheet;
- cargan el CSS de inmediato dentro de VS Code cuando existe
  `window.__LUMEN_WEBVIEW_BOOTSTRAP__`, y lo esperan hasta `window.load` en
  navegador normal. El JS principal no espera a `window.load`.

## Performance

Scripts disponibles:

```txt
bun run perf:harness
bun run perf:smoke
bun run perf:baseline
node scripts/measure-page-load.mjs
node scripts/measure-vscode-webview.mjs
```

`perf:harness` usa Vite preview + Chromium CDP, mide estados visuales de la
ruta y escribe resultados bajo `perf/results` y capturas bajo `perf/visual`.
El host de webview de VS Code tambien acepta mensajes `perf.report` desde la
webview y los guarda en `.lumen-perf/vscode-webview.jsonl`.

## Documentacion

La documentacion principal vive en `Architectural-plans/`. Aunque varios
documentos describen la arquitectura objetivo, cada modulo documentado debe
indicar el estado actual del repo cuando todavia es mock, planned o parcial.
