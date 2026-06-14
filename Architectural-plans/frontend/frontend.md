# Frontend

Archivo: `Architectural-plans/frontend/frontend.md`

## Propósito

`Frontend` define la capa visual de Lumen.

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

- **React**: puede existir como prototipo histórico, pero el frontend final debe migrarse a Svelte.
- **DOM interno de VS Code**: no debe tocarse ni hackearse.
- **Cloud como fuente directa de estado visual final**: Cloud entrega metadata/assets, pero el estado visual final se compone localmente.

## Estructura de carpeta

Estructura inicial propuesta:

```txt
frontend/
  frontend.md

  app-shell/
  route-path-view/
    route-path-view.md

  webgl-snake/
  node-assets/
  theme-system/
  ui-state/
  exercise-collection-view/
  ask-tutor-ui/
```

No todas las subcarpetas necesitan documentación ahora.

Se crean como fronteras conceptuales para que el desarrollo no mezcle todo en una sola carpeta.

La primera documentación profunda dentro de `frontend` es `route-path-view.md`.

## Submódulos iniciales

`app-shell` contiene la estructura visual general de Lumen dentro de la webview: layout base, navegación, raíz de vistas y contenedor de estado.

`route-path-view` contiene la vista tipo Duolingo de rutas y módulos: snake path, nodos, progreso, labels, estados y CTA.

`webgl-snake` contiene el renderer reusable del snake path: geometry, material, postprocess, presets y animación.

`node-assets` contiene assets y reglas visuales de nodos: completado, activo, bloqueado, reto, quiz, proyecto y sombras.

`theme-system` contiene colores, tokens visuales, presets por módulo, gradientes, glow, glass y variantes.

`ui-state` contiene estado visual local de la webview. No reemplaza al Local Engine ni a SQLite.

`exercise-collection-view` contiene la UI visual de la colección de ejercicios.

`ask-tutor-ui` contiene la entrada compacta, paneles, pistas y respuestas de la Guía.

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

El prototipo actual puede estar en React/JSX.

El frontend final de Lumen debe migrarse a Svelte.

Los archivos existentes del prototipo pueden servir como referencia técnica y visual.

Ejemplos mencionados en el proyecto actual:

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

Permite migrar el prototipo actual hacia una arquitectura limpia.
