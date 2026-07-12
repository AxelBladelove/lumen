# Architectural-plans/Tech-stack.md

## Estado actual del repo

La implementación presente cubre un slice local-first de Lumen como extensión
de VS Code y Route Loop v5:

- Extension Host en TypeScript con comandos `lumen.open`, `lumen.enterMode`,
  `lumen.exitMode`, `lumen.engineStatus`, `lumen.refreshWebview` y
  `lumen.compileCurrentExercise`.
- Webview View `lumen.routePath` dentro del contenedor de Activity Bar `Lumen`
  como launcher liviano.
- WebviewPanel de editor `lumen.routePathPanel` como superficie real del
  frontend de Lumen.
- Frontend Svelte 5 + Vite empaquetado dentro de `frontend/dist`.
- Route Path View para `Ruta C / Módulo 2: Cadenas de caracteres`, alimentada
  por snapshots del engine y con datos mock como fallback de desarrollo.
- Renderer WebGL con Three.js para el snake path.
- Scripts locales de medición CDP, harness visual y sincronización local en
  `scripts/`.
- Resultados y baselines de performance bajo `perf/`.
- Reportes JSONL de webview real bajo `.lumen-perf/`.
- Assets de marca en `assets/brand/`, incluyendo logo y wordmark runtime.
- Local Engine en Rust bajo `engine/`, con binario `lumen-engine`, protocolo
  v5 por NDJSON/stdio y SQLite local en `lumen.db`.
- Migraciones versionadas hasta schema v5, con intentos de compilación y tests,
  progreso, inventario instalado y working copy activa.
- Métodos para sesión, toolchain, importación `.esex`, snapshots de ruta,
  compilación, tests IO, progreso y activación de working copies.
- Compilación con `F9` implementada vía GCC en PATH o MSYS2, diagnósticos
  estructurados y registro de intentos en `compile_attempts`.

Todavía no existen Ask Tutor, Cloudflare Workers, D1, R2, KV, AI Gateway,
Tauri, standalone ni Tree-sitter. `.esex` y la gestión local de ejercicios sí
existen como slice; reset, gates avanzados y aislamiento total de ejecución
siguen pendientes. Las secciones siguientes mezclan tecnología actual y
arquitectura objetivo según lo indique cada módulo.

## Frontend

| Tecnología          | Por qué se decidió                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Svelte              | Permite construir una UI rápida, ligera y con menos boilerplate que React. Encaja con una interfaz visual rica sin cargar demasiado runtime. |
| Vite                | Dev server y build tool rápido para iterar la UI de Lumen sin fricción.                                                                      |
| Bun                 | Runtime/tooling rápido para desarrollo, scripts y manejo de paquetes del frontend.                                                           |
| Webviews de VS Code | Permiten montar la UI inicial de Lumen dentro de VS Code mientras se valida el producto.                                                     |
| Three.js            | Renderer actual del snake WebGL dentro de Route Path View.                                                                                   |
| Tauri               | Ruta más probable para el standalone futuro: permite usar UI web con backend Rust sin cargar Electron completo.                              |
| Monaco Editor       | Opción base para el editor en standalone si Lumen deja de depender de VS Code.                                                               |

## Extension Host

| Tecnología            | Por qué se decidió                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| VS Code Extension API | Permite empezar rápido usando comandos, keybindings, settings, vistas, webviews, test integrations y el editor real de VS Code. |
| TypeScript            | Lenguaje natural para extensiones de VS Code y puente inicial entre la UI, VS Code y el Rust Engine.                            |

## Local Engine

| Tecnología         | Por qué se decidió                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Rust               | Núcleo principal por performance, seguridad, bajo consumo y buena integración con tooling local.                        |
| SQLite             | Base local simple, rápida, portable y suficiente para progreso, cache, ejercicios importados, intentos y configuración. |
| Tree-sitter        | Parser rápido e incremental para analizar código C sin depender de regex frágiles.                                      |
| MSYS2 UCRT64 + GCC | Toolchain inicial para compilar C en Windows de forma local y gratuita.                                                 |
| `.esex`            | Formato propio para ejercicios importables, versionados y verificables.                                                 |

## Backend / Cloud

| Tecnología                 | Por qué se decidió                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare Workers         | Backend serverless gratuito dentro de límites, rápido y suficiente para API privada, catálogo, auth ligera, sync y AI gateway. |
| Cloudflare D1              | Base remota para metadata, usuarios, módulos, versiones, imports, leaderboard y sync ligero.                                   |
| Cloudflare R2              | Storage privado para paquetes `.esex`, assets, snapshots e índices sin exponer el contenido públicamente.                      |
| Cloudflare Durable Objects | Realtime para Race, Duo, presencia y salas temporales con estado coordinado.                                                   |
| Cloudflare KV              | Cache opcional para flags, respuestas pequeñas, rate limits simples y metadata no crítica.                                     |

## AI

| Tecnología                           | Por qué se decidió                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| AI Gateway server-side               | Evita poner API keys en cliente y permite controlar proveedores, límites, contexto y formato de respuesta. |
| JSON estructurado                    | Hace que las respuestas del tutor sean parseables, controlables y reutilizables por la UI.                 |
| BYOK / free-provider routing | Mantiene la función de IA sin obligar a que Lumen pague tokens desde el inicio.                            |

## Standalone Research

| Tecnología                 | Por qué se decidió                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tauri + Svelte + Monaco    | Ruta standalone más equilibrada: UI portable, buen rendimiento y menos peso que Electron.                     |
| Rust nativo + GPUI         | Ruta experimental más performance-first, inspirada por Zed, pero más compleja de construir que Tauri/Svelte.  |
| Code-OSS Fork              | Alternativa si se decide conservar más del workbench de VS Code ya hecho, aceptando más peso y mantenimiento. |
| Zed / GPUI como referencia | Inspiración para UX rápida, command palette, settings, keybindings, project panel y filosofía de performance. |
