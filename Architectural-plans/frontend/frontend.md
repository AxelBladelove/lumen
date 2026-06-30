# Frontend

Archivo: `Architectural-plans/frontend/frontend.md`

## Propósito

`Frontend` define la capa visual de Lumen.

## Estado actual del repo

El frontend implementado hoy vive en `frontend/` como una app Svelte 5 con
Vite y Three.js. La pantalla real disponible es `RoutePathView`, conectada a
datos mock de `Ruta C / Módulo 2: Cadenas de caracteres`.

La app se monta desde `frontend/src/main.ts`, usa `App.svelte` como raíz y se
comunica con la extensión mediante `frontend/src/webview/vscodeBridge.ts`.
Al iniciar, envía `frontend.ready`; también emite `route.node.selected` y
`route.continue.requested`. Puede recibir snapshots de módulo o eventos de
ejercicio completado, aunque en el estado actual el dato inicial viene del mock.

El build actual no es un Vite default puro: `frontend/vite.config.ts` usa base
relativa, separa Three.js en chunk manual, inlinea CSS en `dist/index.html`,
difiere el entry module hasta `window.load` y elimina PNG source de `dist`
cuando existen assets runtime `.webp`.

No están implementadas todavía las vistas de onboarding, selección de modos,
Free Mode, colección de ejercicios, Ask Tutor, estados de compilación ni
errores reales del Local Engine.

Esta carpeta no documenta el Local Engine, la base de datos, Cloud, compilación ni el instalador. Su responsabilidad es ordenar cómo se construye la UI de Lumen dentro de VS Code y cómo esa UI se separa de la lógica real del producto.

La regla principal es:

```txt
Frontend muestra.
Extension Host coordina.
Local Engine decide.
SQLite recuerda.
Cloud entrega contenido remoto.
```

## Nombre del módulo

La carpeta debe llamarse:

```txt
frontend/
```

No `ui/`.

La razón es que esta capa no contiene solo pantallas bonitas. También contiene componentes, estado visual, integración con WebGL, assets, temas, animaciones, vistas de rutas, vistas de colección, UI de Ask Tutor y shell visual de la webview.

`UI` describe solo la interfaz.

`Frontend` describe mejor la capa completa.

## Qué es Frontend en Lumen

Frontend es la aplicación visual de Lumen que corre dentro de una webview de VS Code.

Debe estar construida principalmente con Svelte.

Debe poder renderizar vistas complejas como:

- Lumen onboarding.
- Selección de modos.
- Free Mode.
- Route Mode.
- Colección de ejercicios.
- Route Path View.
- Ask Tutor UI.
- Estados de compilación.
- Estados de error.
- Ayuda contextual.
- Animaciones y transiciones.

El frontend no debe ser la fuente de verdad del producto.

## Tech stack del módulo

Este módulo usa estas tecnologías del tech stack de Lumen:

- **Svelte**: framework principal para componentes visuales.
- **Vite**: build/dev server del frontend.
- **Bun**: package manager y runner del proyecto frontend.
- **TypeScript**: tipos, contratos de UI y estado.
- **VS Code Webview**: contenedor donde corre la UI de Lumen dentro de VS Code.
- **Webview message passing**: comunicación con el Extension Host.
- **WebGL / Canvas**: render de materiales visuales avanzados como el snake path.
- **CSS**: layout, glassmorphism, glow, sombras, tipografía y responsive behavior.
- **Assets locales**: nodos, decoraciones, materiales, iconos y sprites.
- **Local Engine state**: datos reales de ejercicios, progreso, bloqueos y estado activo.

Tecnologías que no deben ser el default de esta capa:

- **React**: puede existir como prototipo histórico, pero el frontend implementado en este repo ya usa Svelte.
- **DOM interno de VS Code**: no debe tocarse ni hackearse.
- **Cloud como fuente directa de estado visual final**: Cloud entrega metadata/assets, pero el estado visual final se compone localmente.

## Estructura de carpeta

Estructura objetivo propuesta:

```txt
frontend/
  src/
    App.svelte
    app.css
    brand/
    route-path-view/
    webgl-snake/
    webview/
  public/
    assets/
    materials/
  usuario/
```

El repo actual usa `src/route-path-view`, `src/webgl-snake`, `src/webview` y
`src/brand`. Las carpetas conceptuales como `exercise-collection-view` o
`ask-tutor-ui` todavía no existen.

## Submódulos iniciales

`App.svelte` contiene la raíz visual actual de la webview y el puente de
mensajes con VS Code.

`route-path-view` contiene la vista tipo Duolingo de rutas y módulos: snake path, nodos, progreso, labels, estados y CTA.

`webgl-snake` contiene el renderer reusable del snake path: geometry, material, postprocess, presets y animación.

Los assets de nodos viven hoy en `frontend/public/assets/route-nodes`.

El theme del módulo vive hoy en `src/route-path-view/theme/moduleTheme.ts`.

El estado visual local de la ruta vive hoy dentro de `RoutePathView.svelte`.
No reemplaza al Local Engine ni a SQLite.

`exercise-collection-view` no está implementado todavía.

`ask-tutor-ui` no está implementado todavía.

## Relación con VS Code Webview

Frontend vive dentro de una webview.

La webview permite renderizar HTML/CSS/JS propio dentro de VS Code, pero debe comunicarse con la extensión mediante message passing.

Frontend no habla directamente con el Local Engine.

El flujo correcto es:

```txt
Frontend -> Webview message -> Extension Host -> Bridge -> Local Engine
```

Y de vuelta:

```txt
Local Engine -> Bridge -> Extension Host -> Webview message -> Frontend
```

## Relación con Local Engine

Frontend no decide si un ejercicio está bloqueado.

No decide si una ruta avanzó.

No decide si un intento cuenta.

No decide qué ejercicio es el activo.

Debe pedir estado y renderizarlo.

El Local Engine entrega datos como:

- modo actual
- ruta activa
- módulo activo
- nodos
- ejercicio activo
- progreso
- bloqueos
- errores
- intentos
- pistas usadas

Frontend convierte esos datos en UI.

## Relación con Cloud

Cloud entrega metadata, assets y paquetes.

Frontend no debe depender directamente de Cloud para renderizar el estado final del usuario.

El estado final visible debe ser una composición de:

```txt
metadata remota/cacheada
estado local del usuario
progreso local
assets disponibles
```

Frontend puede usar assets descargados o cacheados, pero no debe asumir que internet está siempre disponible.

## Relación con assets

Frontend usa una metodología híbrida entre web development y game development.

Eso significa que algunas partes son componentes Svelte/CSS, y otras partes son assets visuales o render procedural.

Ejemplos:

- nodos como PNG/WEBP/SVG optimizados
- sombras generadas matemáticamente
- snake path renderizado con WebGL
- decoración como assets
- labels como DOM/Svelte
- estados como data-driven UI

No todo tiene que ser CSS puro.

No todo tiene que ser imagen estática.

La regla es usar la técnica que dé mejor fidelidad visual y performance.

## Migración desde prototipo React

La parte visual usada por este slice ya fue portada a Svelte.

Los archivos equivalentes actuales son:

```txt
frontend/src/webgl-snake/geometry.js
frontend/src/webgl-snake/materialPresets.ts
frontend/src/webgl-snake/materials.js
frontend/src/webgl-snake/postprocess.js
frontend/src/webgl-snake/WebGLSnake.svelte
frontend/src/route-path-view/path/snakePath.generated.ts
```

Ejemplos históricos del prototipo:

```txt
src/webgl/geometry.js
src/webgl/material-preset.ts
src/webgl/material.js
src/webgl/postprocess.js
src/webgl/snake.svg.js
src/webgl/WebGLSnake.jsx
```

La IA o programador debe inspeccionar el proyecto real antes de reescribir.

No debe tirar la lógica visual ya lograda.

Debe portar lo útil a una estructura Svelte limpia.

## Reglas deterministas

Frontend muestra, no decide lógica de producto.

Frontend final usa Svelte.

La webview no toca el DOM interno de VS Code.

WebGL se usa para materiales avanzados cuando aporta valor real.

Assets se usan cuando dan mejor fidelidad que CSS puro.

El estado real viene del Local Engine.

Cloud entrega metadata/assets, no estado final de usuario.

Route Path View es el primer submódulo visual importante.

## Resultado esperado

Frontend permite construir una experiencia visual de Lumen que se sienta premium, fluida y clara.

Permite usar Svelte para la UI.

Permite usar WebGL para el snake path.

Permite usar assets como en game development.

Permite renderizar rutas tipo Duolingo sin mezclar lógica de producto con presentación.

Permite seguir consolidando el prototipo ya portado a Svelte hacia una arquitectura limpia.
