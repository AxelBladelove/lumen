# Lumen

Lumen is currently a VS Code extension shell that packages a Svelte/Vite
frontend as the `lumen.routePath` webview. The implemented slice is a mocked
Route C / Module 2 path view for `Cadenas de caracteres`.

## Current Implementation

- Root extension package: `package.json`.
- Extension entry: `extension/src/extension.ts`.
- Webview provider: `extension/src/lumenRoutePathViewProvider.ts`.
- Frontend app: `frontend/src/App.svelte`.
- Route view: `frontend/src/route-path-view/RoutePathView.svelte`.
- WebGL snake renderer: `frontend/src/webgl-snake/WebGLSnake.svelte`.
- Mock route data: `frontend/src/route-path-view/data/mockRouteModule.ts`.

The extension contributes the Lumen activity-bar container, the `Ruta C`
webview view, and the commands `lumen.open`, `lumen.enterMode`,
`lumen.exitMode`, and `lumen.refreshWebview`.

Route data is still mocked in the frontend. There is no Local Engine, SQLite
database, Cloudflare backend, compile command, Ask Tutor command, or packaged
exercise collection in this repository yet.

## Development

Install dependencies with Bun, then build both frontend and extension:

```txt
bun install
bun run build
```

Useful scripts:

```txt
bun run dev:frontend
bun run build:frontend
bun run compile:extension
bun run build
```

The webview provider reads `frontend/dist/index.html`. If the frontend has not
been built, the extension shows a minimal missing-build page that asks the user
to run `bun run build`.

## Frontend Build Shape

The Vite build uses a relative base so it can run inside a VS Code webview.
Custom Vite plugins inline the built CSS into `index.html`, defer the entry
module until `window.load`, and prune source PNGs from `frontend/dist` after
runtime WebP assets are emitted.

## Performance Tools

Two local CDP measurement scripts exist under `scripts/`:

```txt
node scripts/measure-page-load.mjs
node scripts/measure-vscode-webview.mjs
```

`measure-page-load.mjs` targets a browser-served frontend origin
(`PERF_ORIGIN`, default `http://127.0.0.1:4173`). `measure-vscode-webview.mjs`
expects a VS Code CDP port and an active Lumen webview target.
