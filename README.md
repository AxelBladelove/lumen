# Lumen

Lumen es, en este estado del repo, una extension local-first de VS Code con un
frontend Svelte/Vite dentro de un `WebviewPanel` y un Local Engine en Rust.

El slice implementado cubre `Ruta C / Modulo 2: Cadenas de caracteres`: ruta
visual, importacion de actividades `.esex`, compilacion y tests IO, progreso
persistente, el Route Loop v5 para activar una copia editable y el panel de
enunciado v6 (5 actividades reales del modulo). La integracion
de extremo a extremo sigue parcial; gates avanzados, sandbox completo y
servicios cloud no forman parte del slice actual.

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
- Fallback visual de ruta: `frontend/src/route-path-view/data/mockRouteModule.ts`.
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
lumen.testCurrentExercise
```

## Local Engine

`engine/` contiene el Local Engine: un binario Rust (`lumen-engine`) que habla
NDJSON por stdio con el Extension Host y persiste estado en SQLite (`lumen.db`
bajo el globalStorage de la extension), con migraciones versionadas. El
contrato vigente es
`Architectural-plans/extension-engine-bridge/protocol-v6.md`. Incluye sesiones,
toolchain, importacion `.esex`, snapshots de ruta, compilacion, tests IO,
progreso, `exercise.activate` con working copies separadas del contenido
instalado y `exercise.getDetail` (enunciado, hints y progreso para el panel
derecho).

El flujo de compilacion `F9` resuelve el entrypoint de la working copy activa
en el engine y llama `exercise.compile`; el
engine descubre GCC (PATH o MSYS2), compila con `-Wall -Wextra -g` a
`.lumen-build/`, devuelve diagnosticos estructurados y registra el intento en
`compile_attempts`. Con exito se abre una consola externa de Windows; con
errores se muestra la terminal integrada `Lumen Compile` (errores en rojo,
warnings en azul). Orquestacion en `extension/src/lumenCompile.ts`.

La extension administra el binario mediante
`extension/src/engine/lumenEngineClient.ts`, hace un health check al activar y
expone `lumen.engineStatus` para inspeccionarlo. En desarrollo el cliente busca
el binario en `engine/target/{release,debug}`; en la copia instalada, en
`bin/lumen-engine.exe` (sincronizado por `install:local`).

Existen actividades locales empaquetadas bajo `content/activities/`. Todavia
no existen Cloudflare backend ni Ask Tutor. La progresion implementada es
secuencial y el aislamiento de ejecucion aplica solo los limites que el runner
documenta; no debe interpretarse como un sandbox completo.

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
bun run build:package-assets
bun run verify:package
bun run test:frontend
bun run build
bun run build:local
```

`build:engine` requiere el toolchain de Rust (`cargo`). Los tests del engine
corren con `cargo test` desde `engine/`.

`build:local` compila el repo, genera `bin/` y los `.esex` bundled, y sincroniza
`extension/out`, `frontend/dist`, `assets`, `bin`, `content/packages` y
`package.json` dentro de la copia instalada en
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
