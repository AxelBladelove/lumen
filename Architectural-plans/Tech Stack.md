# Architectural-plans/Tech-stack.md

## Estado actual del repo

La implementación presente en este repositorio cubre solo el primer slice de
Lumen como extensión de VS Code:

- Extension Host en TypeScript con comandos `lumen.open`, `lumen.enterMode`,
  `lumen.exitMode` y `lumen.refreshWebview`.
- Webview View `lumen.routePath` dentro del contenedor de Activity Bar `Lumen`.
- Frontend Svelte 5 + Vite empaquetado dentro de `frontend/dist`.
- Route Path View mockeada para `Ruta C / Módulo 2: Cadenas de caracteres`.
- Renderer WebGL con Three.js para el snake path.
- Scripts locales de medición CDP en `scripts/`.

Todavía no existe implementación de Local Engine en Rust, SQLite local,
compilación con `F9`, Ask Tutor, Cloudflare Workers, D1, R2, KV, AI Gateway,
Tauri ni standalone. Las secciones siguientes siguen siendo la arquitectura
objetivo, no una lista de módulos ya implementados.

## Frontend

| Tecnología          | Por qué se decidió                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Svelte              | Permite construir una UI rápida, ligera y con menos boilerplate que React. Encaja con una interfaz visual rica sin cargar demasiado runtime. |
| Vite                | Dev server y build tool rápido para iterar la UI de Lumen sin fricción.                                                                      |
| Bun                 | Runtime/tooling rápido para desarrollo, scripts y manejo de paquetes del frontend.                                                           |
| Webviews de VS Code | Permiten montar la UI inicial de Lumen dentro de VS Code mientras se valida el producto.                                                     |
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
