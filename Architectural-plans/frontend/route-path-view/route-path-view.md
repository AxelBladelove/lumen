# Route Path View

Archivo: `Architectural-plans/frontend/route-path-view/route-path-view.md`

## Propósito

`Route Path View` define la vista visual de módulos dentro de Route Mode.

Es la pantalla tipo Duolingo donde el usuario ve un módulo de una ruta, su progreso, el snake path, los nodos completados, el nodo activo, los nodos bloqueados y el siguiente paso recomendado.

Este documento no define la lógica completa de Route Mode.

No define Cloud.

No define la base de datos.

No define compilación.

Su responsabilidad es definir cómo se construye y se renderiza la experiencia visual del camino de aprendizaje.

## Referencia visual

La referencia principal es la pantalla del módulo 2 de Ruta C: `Cadenas de caracteres`.

La imagen objetivo muestra:

- Header con vuelta a Ruta C.
- Título del módulo.
- Subtítulo.
- Botón de módulos.
- Card de progreso.
- Snake path vertical con material líquido/glow.
- Nodos completados.
- Nodo activo brillante.
- Nodos bloqueados.
- Labels de ejercicios junto a nodos.
- Decoración lateral.
- Código fantasma decorativo.
- CTA inferior con el siguiente ejercicio.
- Fondo oscuro con profundidad visual.

El prototipo actual en navegador ya tiene parte del layout y el snake path integrado, pero todavía le faltan nodos, sombras, assets finales y refinamiento visual.

## Nombre del submódulo

El submódulo debe llamarse:

```txt
route-path-view/
```

No `route-mode-ui`.

La razón es que Route Mode es el modo de producto completo.

Route Path View es una vista específica dentro de ese modo: la vista del camino de nodos.

## Qué es Route Path View

Route Path View es una vista frontend.

Muestra visualmente el avance del usuario dentro de un módulo.

El usuario debe poder entender:

- En qué ruta está.
- En qué módulo está.
- Cuántos ejercicios lleva.
- Qué porcentaje completó.
- Qué ejercicios ya completó.
- Cuál es el ejercicio actual.
- Qué ejercicios están bloqueados.
- Qué viene después.

La vista debe sentirse como un mapa de progreso, no como una lista plana.

## Tech stack del submódulo

Este submódulo usa estas tecnologías del tech stack de Lumen:

- **Svelte**: componentes principales de la vista.
- **TypeScript**: tipos de módulo, nodos, estados y props.
- **WebGL / Canvas**: render del snake path líquido y animado.
- **CSS**: layout, glassmorphism, labels, sombras, glow y responsive scaling.
- **Assets locales**: nodos, decoraciones, iconos, materiales y posibles sprites.
- **Vite + Bun**: desarrollo y build del frontend.
- **VS Code Webview**: contenedor donde se renderiza la vista dentro de Lumen.
- **Local Engine state**: progreso, nodos desbloqueados, ejercicio activo y estados reales.
- **Cloud metadata/cache local**: definición del módulo, ejercicios, colores, assets y path config.

Tecnologías que no deben ser fuente de verdad:

- **PNG completo de la pantalla**: sirve como referencia visual, no como UI final.
- **React**: puede servir como prototipo, pero la implementación final debe migrar a Svelte.
- **Cloud como renderer**: Cloud entrega metadata/assets, no dibuja la pantalla final.

## Composición visual

Route Path View se compone de varias capas:

```txt
Background layer
Decorative code layer
WebGL snake layer
Node shadow layer
Node asset layer
Node label layer
Header/progress layer
Bottom CTA layer
Interaction layer
```

Cada capa debe tener responsabilidad clara.

El snake path no debe mezclarse con labels.

Los nodos no deben estar quemados dentro del snake.

Los textos deben ser DOM/Svelte para que sean editables, legibles y dinámicos.

## Header

El header debe mostrar:

- Botón de volver a Ruta C.
- Nombre del módulo.
- Subtítulo del módulo.
- Botón de módulos.

En la referencia aparece algo como `Fundamentos C`, pero para Lumen debe ajustarse al lenguaje de producto correcto: `Ruta C`.

El header debe sentirse como parte de una experiencia premium, con glass, borde sutil y glow controlado.

## Card de progreso

La card de progreso debe mostrar:

- ejercicios completados / total
- porcentaje completado
- segmentos visuales de progreso

Ejemplo conceptual:

```txt
18/64 ejercicios
28% completado
```

La información real viene del Local Engine.

La UI solo la presenta.

## Snake path

El snake path es la pieza visual central.

Debe renderizarse de forma procedural o data-driven, no como una imagen fija.

El material visual debe reutilizar el trabajo ya existente del prototipo:

```txt
src/webgl/geometry.js
src/webgl/material-preset.ts
src/webgl/material.js
src/webgl/postprocess.js
src/webgl/snake.svg.js
src/webgl/WebGLSnake.jsx
```

La implementación final debe portar esa lógica a Svelte o envolverla correctamente para que viva en el frontend final.

El snake debe conservar:

- material líquido
- glow
- bloom controlado
- profundidad
- animación sutil
- borde luminoso
- variación interna
- performance aceptable

## Path procedural

Cada módulo debe poder tener su propio path.

No todos los módulos deben usar exactamente la misma curva.

El sistema debe permitir definir un path por módulo usando datos.

Ejemplo conceptual:

```txt
pathId: "route-c-strings"
points: [...]
width: 25
themeColor: "cyan-green"
materialPreset: "liquid-v1"
```

El path debe ser editable sin redibujar todo manualmente.

La IA o programador debe poder crear nuevos paths procedurales o ajustar puntos del path.

## Colores por módulo

El snake debe poder cambiar de color por módulo.

Ejemplos:

```txt
Cadenas -> verde/cyan.
Matrices -> azul.
Punteros -> morado o rojo, según theme.
```

El color no debe estar hardcodeado en el shader de forma irreversible.

Debe venir del theme del módulo o del preset visual.

El material puede conservar el mismo comportamiento y cambiar parámetros como color, glow, edge light y core.

## WebGL Snake

`webgl-snake` debe ser reusable.

Route Path View no debe tener un WebGLSnake específico y cerrado solo para Cadenas.

La vista debe pasarle datos:

```txt
path
width
color
flowSpeed
flowStrength
glowStrength
glowRadius
materialPreset
```

El renderer devuelve el snake visual.

Route Path View coloca nodos encima.

## Nodos

Los nodos representan ejercicios o actividades.

Estados mínimos:

- completed
- active
- locked
- challenge
- quiz
- project

Un nodo completado debe verse desbloqueado y marcado.

Un nodo activo debe tener más glow, anillo o CTA visual.

Un nodo bloqueado debe verse gris/oscuro y no interactivo.

Los nodos no deben ser parte del texture del snake.

Deben ser elementos posicionados sobre el path.

## Posición de nodos

Los nodos deben posicionarse usando datos del path.

La forma recomendada es guardar una posición normalizada sobre el path.

Ejemplo conceptual:

```txt
node.pathT = 0.42
```

`pathT` indica dónde cae el nodo a lo largo del snake.

El sistema calcula:

- posición x/y
- tangente
- normal
- offset lateral
- sombra
- posición del label

Esto permite mover nodos sin rehacer la UI completa.

## Sombras de nodos

Los nodos necesitan sombra para parecer que están encima del snake.

La sombra no debe depender necesariamente de un PNG difícil de controlar.

La estrategia preferida es calcularla matemáticamente usando la tangente del snake en la posición del nodo.

El sistema puede usar:

```txt
tangente del path
normal del path
dirección de luz visual
estado del nodo
tamaño del nodo
```

Con eso puede generar una sombra coherente debajo del nodo.

Si un asset de sombra da mejor resultado visual, puede usarse, pero el default debe favorecer una sombra procedural controlable.

## Labels de nodos

Cada nodo puede tener un label asociado.

Ejemplo:

```txt
Hola mundo
printf

Leer texto
scanf / fgets

Strings básicos
char[], cadenas
```

Los labels deben ser texto real, no parte de una imagen.

Deben poder colocarse a la izquierda o derecha del path según el espacio y el diseño.

El nodo activo debe tener label más prominente y puede incluir CTA como:

```txt
SIGUE AQUÍ
```

## Nodo activo

El nodo activo representa el punto actual del usuario.

Debe verse claramente diferente.

Puede tener:

- anillo brillante
- glow fuerte
- pequeña burbuja lateral
- CTA
- icono del tema
- estado de enfoque

El nodo activo debe corresponder al ejercicio actual que el Local Engine reporta.

La UI no decide por sí sola cuál es el nodo activo.

## Nodos bloqueados

Los nodos bloqueados deben verse bloqueados y no interactivos.

Pueden mostrar candado.

Deben comunicar que existen, pero todavía no están disponibles.

Si el usuario intenta interactuar, la UI puede mostrar una explicación breve:

```txt
Completa el paso anterior para desbloquearlo.
```

La razón exacta de bloqueo viene de Route Mode / Local Engine.

## Tipos de nodo

Route Path View debe soportar tipos de nodo.

Tipos iniciales:

```txt
exercise
challenge
quiz
project
checkpoint
```

Cada tipo puede tener icono o asset diferente.

Por ejemplo, un mini reto puede usar estrella.

Un ejercicio normal puede usar icono del concepto.

Un nodo bloqueado puede usar candado.

## Decoración lateral

La vista puede tener decoraciones laterales como el globo `abc`, círculos, líneas punteadas o elementos temáticos del módulo.

Esas decoraciones no deben ser obligatorias para el funcionamiento.

Deben venir de metadata visual o assets del módulo.

La decoración debe reforzar el tema, no distraer.

## Código fantasma

La vista puede mostrar código decorativo muy tenue en el fondo.

Ejemplo:

```txt
#include <stdio.h>

int main() {
  printf("Hola mundo");
  return 0;
}
```

Ese código no es editable.

Sirve para dar ambiente.

Debe tener opacidad baja y no competir con el path ni los nodos.

## Bottom CTA

La parte inferior debe tener una card de siguiente paso.

Ejemplo:

```txt
Siguiente: Funciones string
```

Puede incluir un botón o icono de continuar.

Debe usar el estado real del módulo.

Si no hay siguiente paso, puede mostrar módulo completado o volver a módulos.

## Datos de entrada

Route Path View debe recibir datos estructurados.

Ejemplo conceptual:

```ts
type RoutePathModuleView = {
  routeId: string;
  moduleId: string;
  title: string;
  subtitle: string;
  completedCount: number;
  totalCount: number;
  percent: number;
  theme: ModuleTheme;
  path: SnakePathConfig;
  nodes: RoutePathNode[];
  decorations: DecorationConfig[];
  nextAction: NextAction;
};
```

La vista no debe inventar estos datos.

Vienen del Local Engine y metadata cacheada.

## Datos de nodo

Ejemplo conceptual:

```ts
type RoutePathNode = {
  id: string;
  exerciseId?: string;
  title: string;
  subtitle?: string;
  type: "exercise" | "challenge" | "quiz" | "project" | "checkpoint";
  status: "completed" | "active" | "locked" | "available";
  pathT: number;
  labelSide?: "left" | "right" | "auto";
  assetKey?: string;
};
```

Esto permite que la misma vista renderice distintos módulos.

## Relación con Cloud

Cloud puede entregar metadata del módulo:

- título
- subtítulo
- ejercicios
- nodos
- colores
- assets
- path config
- decoraciones

Pero Cloud no decide el estado final del usuario.

El estado final sale de combinar metadata con estado local.

## Relación con Local Engine

Local Engine entrega el estado real:

- progreso
- ejercicio activo
- nodos completados
- nodos bloqueados
- siguiente paso
- unlocks
- errores o refuerzos si aplican

Frontend renderiza ese estado.

## Relación con Route Mode

Route Path View es una vista dentro de Route Mode.

Route Mode decide qué módulo abrir y qué significa avanzar.

Route Path View solo muestra el mapa del módulo y permite interactuar con nodos cuando Route Mode lo permite.

## Relación con assets

Los assets pueden venir de:

```txt
frontend local
cache local
R2 descargado
generación procedural
```

Los nodos pueden usar assets PNG/WEBP/SVG cuando la fidelidad lo requiera.

Las sombras pueden generarse matemáticamente.

El snake path debe venir de WebGL/procedural renderer.

## Migración del prototipo actual

El prototipo actual en `Prueba UI extension` debe usarse como referencia.

La IA o programador debe inspeccionar:

```txt
src/webgl/
src/components/
public/materials/
LessonPath
WebGLSnake
material presets
snake path generated
```

Debe migrar el resultado a Svelte sin perder el material visual logrado.

No se debe empezar desde cero si el prototipo ya logró parte del material del snake.

## Performance

Route Path View debe ser performance-first.

Debe evitar rerenderizar WebGL innecesariamente.

Debe separar DOM y WebGL.

Debe usar assets optimizados.

Debe evitar animaciones pesadas si la webview pierde foco.

Debe poder renderizar módulos largos sin sentirse lenta.

El snake puede animarse, pero no debe consumir recursos de forma absurda.

## Responsive dentro de VS Code

La vista vive dentro de una webview.

Debe adaptarse al tamaño disponible.

El diseño base de referencia es vertical, pero debe escalar correctamente si el panel cambia de ancho o alto.

La UI no debe romperse si VS Code cambia tamaño.

El path, nodos y labels deben recalcular posiciones según el viewport de la webview.

## Fallback

Si WebGL no está disponible o falla, la vista debe tener fallback.

Opciones:

- SVG path estático.
- Canvas 2D simple.
- Imagen generada temporal.
- Mensaje controlado si no hay alternativa.

El fallback no tiene que tener la misma fidelidad visual, pero debe permitir usar Lumen.

## Estados principales

Route Path View debe manejar:

- cargando módulo
- módulo listo
- módulo sin progreso
- nodo activo
- nodo bloqueado
- módulo completado
- error cargando assets
- error WebGL
- sin metadata
- sin conexión usando cache local

## Reglas deterministas

Route Path View es frontend.

Route Path View no decide progreso.

Route Path View no decide desbloqueos.

El snake path es procedural/data-driven.

Los nodos van encima del path.

Los labels son texto real.

El nodo activo viene del Local Engine.

Los colores vienen del theme del módulo.

Cloud entrega metadata/assets, no pixeles finales.

El prototipo actual debe migrarse a Svelte, no descartarse.

Las sombras de nodos deben preferir cálculo por tangente si da mejor control.

La UI debe parecerse a la referencia visual, no a una lista de ejercicios.

## Resultado esperado

El usuario entra a un módulo de Ruta C.

Ve una pantalla visualmente rica, con progreso, snake path, nodos y siguiente paso.

Los nodos completados se sienten logrados.

El nodo activo se siente importante.

Los nodos bloqueados comunican progreso futuro.

El snake path se siente vivo y procedural.

La vista se puede reutilizar para otros módulos cambiando datos, color, path, assets y nodos.

Route Path View convierte Route Mode en una experiencia de aprendizaje visual, no en un explorador de carpetas.
