# Lumen

Lumen es, en este estado del repo, una extension de VS Code que empaqueta un
frontend Svelte/Vite dentro de la webview `lumen.routePath`.

El slice implementado es un mock visual de `Ruta C / Modulo 2: Cadenas de
caracteres`. Sirve para validar la experiencia de Route Path View, el snake
WebGL, la pantalla de entrada, el pipeline de build y la medicion de
performance.

## Implementacion Actual

- Paquete raiz de la extension: `package.json`.
- Entry point de la extension: `extension/src/extension.ts`.
- Webview provider: `extension/src/lumenRoutePathViewProvider.ts`.
- Estado de entrada/workspace: `extension/src/lumenEntryState.ts`.
- App frontend: `frontend/src/App.svelte`.
- Vista de ruta: `frontend/src/route-path-view/RoutePathView.svelte`.
- Renderer WebGL del snake: `frontend/src/webgl-snake/WebGLSnake.svelte`.
- Datos mock de ruta: `frontend/src/route-path-view/data/mockRouteModule.ts`.
- Assets de marca: `assets/brand/`.
- Scripts de performance e instalacion local: `scripts/`.

La extension contribuye el contenedor de Activity Bar `Lumen`, la vista
webview `Ruta C` y los comandos:

```txt
lumen.open
lumen.enterMode
lumen.exitMode
lumen.refreshWebview
```

Todavia no existen Local Engine, SQLite local, Cloudflare backend, comando de
compilacion, Ask Tutor ni coleccion de ejercicios empaquetada.

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
bun run build
bun run build:local
```

`build:local` compila el repo y sincroniza `extension/out`, `frontend/dist`,
`assets` y `package.json` dentro de la copia instalada en
`~/.vscode/extensions/lumen.lumen-0.0.1`. Despues de correrlo, VS Code debe
recargarse con `Developer: Reload Window` para tomar la nueva copia.

## Build de la Webview

El provider lee `frontend/dist/index.html`. Si el frontend no fue compilado,
la extension muestra una pagina minima que pide ejecutar `bun run build`.

El build de Vite usa `base: "./"` para funcionar dentro de la webview. Los
plugins locales:

- eliminan PNG source de `dist` cuando existen assets runtime `.webp`;
- reemplazan el entry module por un bootstrap diferido;
- reemplazan el CSS por un loader diferido de stylesheet;
- cargan JS/CSS inmediatamente dentro de VS Code cuando existe
  `window.__LUMEN_WEBVIEW_BOOTSTRAP__`, y esperan a `window.load` en navegador
  normal.

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
El provider de VS Code tambien acepta mensajes `perf.report` desde la webview
y los guarda en `.lumen-perf/vscode-webview.jsonl`.

## Documentacion

La documentacion principal vive en `Architectural-plans/`. Aunque varios
documentos describen la arquitectura objetivo, cada modulo documentado debe
indicar el estado actual del repo cuando todavia es mock, planned o parcial.
