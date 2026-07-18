# Route Path View

Archivo: `Architectural-plans/frontend/route-path-view/route-path-view.md`

## Propósito

`Route Path View` define la vista visual de módulos dentro de Route Mode.

## Estado actual del repo

La implementación actual está en `frontend/src/route-path-view/` y renderiza
`Ruta C / Módulo 2: Cadenas de caracteres`. Puede arrancar con datos fallback,
pero el estado pedagógico real llega en snapshots del Local Engine a través
del Extension Host.

Archivos principales:

```txt
RoutePathView.svelte
components/RouteHeader.svelte
components/ProgressCard.svelte
components/SnakeLayer.svelte
components/NodeOverlay.svelte
components/HeroTextSticker.svelte
components/BottomCta.svelte
data/mockRouteModule.ts
path/pathMetrics.ts
path/snakePath.generated.ts
theme/moduleTheme.ts
types/routePath.ts
```

La vista actual:

- Calcula escala y ancho de layout para un stage fijo de `1086 x 1448`.
- Usa `pathT` y `pathMetrics.ts` para colocar nodos, labels, sombras y zonas
  de contacto sobre el SVG path.
- Renderiza el snake path con `SnakeLayer` y `WebGLSnake`.
- Divide el snake en dos segmentos visuales: desbloqueado líquido y bloqueado
  graphite/purple.
- Monta nodos, progreso, hero y CTA bajo `deferredVisualsReady`, que hoy se
  activa inmediatamente y conserva el contrato de estado `routeVisuals`.
- Anima transiciones `complete/unlock` a partir del snapshot autoritativo; la
  intención de continuar no desbloquea nodos por sí sola.
- Permite seleccionar nodos completados para estado visual de repetición.
- Espera el primer `route.module.data` con progreso y CTA atenuados, sin mover
  el layout ni alterar el snake; tras 5 segundos conserva el mock local.
- Los nodos bloqueados muestran una explicación breve, accesible y efímera al
  activarse con puntero o teclado.
- Respeta `prefers-reduced-motion` para saltar o apagar animaciones pesadas.
- Expone marks de performance como `lumen:route-mounted`,
  `lumen:continue-pressed`, `lumen:route-advance-start` y
  `lumen:route-advance-first-frame`.

El protocolo v7 aporta datos reales, persistencia, activación y desbloqueo
secuencial. Todavía faltan estados completos de error/empty, gates no
secuenciales y módulos dinámicos más allá del slice actual.

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

El repo actual ya incluye layout, snake path, nodos, sombras calculadas,
assets runtime, labels, progreso, CTA y refinamiento visual inicial. El trabajo
pendiente ya no es portar esos elementos básicos, sino conectarlos a datos
reales, ampliar estados y endurecer fallbacks.

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

Comportamiento objetivo (`planned`): la composición renderiza un tramo del módulo, no el módulo entero. Cada tramo muestra pocos nodos, aproximadamente entre cinco y siete, con el espaciado generoso de la referencia del módulo 2. Comprimir ocho o más nodos en un único path hasta degradar ese espaciado es un defecto.

El header y la card permanecen fuera de esa paginación visual: título, conteo y porcentaje expresan el módulo completo, por ejemplo `18/64 ejercicios`, nunca solo el tramo visible.

## Header

El header debe mostrar:

- Botón de volver a Ruta C.
- Nombre del módulo.
- Subtítulo del módulo.
- Botón de módulos.

En la referencia aparece algo como `Fundamentos C`, pero para Lumen debe ajustarse al lenguaje de producto correcto: `Ruta C`.

El header debe sentirse como parte de una experiencia premium, con glass, borde sutil y glow controlado.

En ancho expandido, el icono y el texto de cada pill forman una única unidad
óptica y esa unidad completa queda centrada dentro del cristal. Por debajo del
breakpoint compacto las etiquetas de ambas pills colapsan, sus iconos se
centran ópticamente y el bloque editorial del título conserva la misma
colocación centrada que en ancho expandido. Dentro del bloque, kicker, título y
subtítulo permanecen alineados a la izquierda: `MÓDULO N` siempre arranca sobre
el inicio del título, no centrado como una línea independiente. El resize
interpola tamaños y offsets; no debe dejar el bloque pegado al control izquierdo
ni saltar el icono al cambiar de modo.

Al entrar en Detalles, el zoom espacial afecta como una sola composición al
snake, los nodos y el código decorativo de fondo. Ninguna de esas capas debe
quedar estática mientras las otras se acercan. Los conectores entre los
cristales de entrada y salida reservan su propio hueco vertical, apuntan hacia
abajo y se centran respecto al cristal de salida sin superponerse a ninguno.

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

Cada tramo de cada módulo debe poder tener su propio path.

No todos los módulos ni todos sus tramos deben usar exactamente la misma curva.

El sistema debe permitir definir los paths ordenados de un módulo usando datos.

Ejemplo conceptual:

```txt
pathId: "route-c-strings-03"
points: [...]
width: 25
themeColor: "cyan-green"
materialPreset: "liquid-v1"
```

El path debe ser editable sin redibujar todo manualmente.

La IA o programador debe poder crear nuevos paths procedurales o ajustar puntos del path.

Comportamiento objetivo (`planned`): al completar el último nodo visible, la vista hace scroll hacia el tramo siguiente. La transición usa keyframes con `ease-in` y `ease-out`, es suave y no produce flashes. El tramo entrante trae los ejercicios siguientes del mismo módulo y usa una curva procedural distinta, generada por sus propios datos; no es una continuación comprimida ni una copia de la curva anterior.

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

En la implementación actual, `SnakeLayer.svelte` importa `materialPresets`,
construye presets para el segmento desbloqueado y el segmento bloqueado, y pasa un
arreglo `segments` a `WebGLSnake.svelte`. El renderer
soporta rangos `rangeStart/rangeEnd`, caps líquidos o grises, themes por
segmento, escala de render reducida para webview/mobile y estadísticas en
`window.__LUMEN_WEBGL_STATS__`.

Si la URL contiene `lumenPerfVisual`, `SnakeLayer.svelte` congela el tiempo de
los segmentos para screenshots deterministas.

## Nodos

Los nodos representan ejercicios o actividades.

Estados modelados en los tipos actuales:

- completed
- active
- locked
- challenge
- quiz
- project

En `NodeStatus` hoy existen `completed`, `active`, `locked` y `challenge`.
`quiz`, `project` y `checkpoint` existen como `NodeType`, pero no todos tienen
asset visual específico todavía. El mock actual incluye ejercicios, un
challenge y un project bloqueado.

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

Forma conceptual objetivo:

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

Forma implementada actualmente en `types/routePath.ts`:

```ts
type RoutePathModuleView = {
  routeTitle: string;
  moduleNumber: number;
  title: string;
  subtitle: string;
  completed: number;
  total: number;
  percent: number;
  theme: ModuleTheme;
  path: SnakePathConfig;
  nodes: RoutePathNode[];
  nextAction: {
    label: string;
    targetTitle: string;
  };
};
```

La vista no debe inventar estos datos en la arquitectura final.

Vienen del Local Engine y metadata cacheada.

En el repo actual `mockRouteModule.ts` es fallback visual. El estado real se
recibe mediante `route.module.data`/`route.module.snapshot` desde el bridge y
la UI no reinterpreta `completed`, `active` ni `locked`.

## Datos de nodo

Ejemplo conceptual:

```ts
type RoutePathNode = {
  id: string;
  exerciseId?: string;
  title: string;
  subtitle?: string;
  type: "exercise" | "challenge" | "quiz" | "project" | "checkpoint";
  status: "completed" | "active" | "locked" | "challenge";
  pathT: number;
  labelSide?: "left" | "right" | "auto";
  size?: number;
  nodeOffset?: { x: number; y: number };
  labelOffset?: { x: number; y: number };
  motion?: "complete" | "unlock";
  reviewMode?: "repeat";
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

El prototipo en `Prueba UI extension` ya fue usado como referencia para el
slice actual.

Las piezas equivalentes en el repo son:

```txt
frontend/src/webgl-snake/
frontend/src/route-path-view/components/
frontend/public/materials/
frontend/src/route-path-view/path/snakePath.generated.ts
```

La regla sigue siendo no descartar lo que ya funciona, pero la tarea pendiente
ya no es una migración React -> Svelte de este slice.

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

Decisión de producto (2026-07-18): el snake WebGL no tiene fallback degradado.

Un sustituto SVG/canvas de menor fidelidad es regresión visual y no se acepta.

Si WebGL falla en un entorno soportado, eso es un bug del engine visual y se
arregla; no se decora con un estado alternativo.

## Estados principales

Route Path View debe manejar:

- cargando módulo
- módulo listo
- módulo sin progreso
- nodo activo
- nodo bloqueado
- transición al tramo siguiente (`planned`)
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

La vista muestra entre cinco y siete nodos por tramo y conserva el progreso del módulo completo.

Cada tramo sucesivo usa una curva distinta definida por datos.

Los nodos van encima del path.

Los labels son texto real.

El nodo activo viene del Local Engine.

Los colores vienen del theme del módulo.

Cloud entrega metadata/assets, no pixeles finales.

El slice actual ya está en Svelte; cualquier prototipo externo debe usarse como referencia sin descartar lo que ya funciona.

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
