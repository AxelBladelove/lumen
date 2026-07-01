# WebGL Snake

Archivo: `Architectural-plans/frontend/webgl-snake/webgl-snake.md`

## Proposito

`WebGL Snake` documenta el renderer procedural que dibuja el camino principal
de Route Path View.

Este modulo no decide progreso, nodos, desbloqueos ni layout de VS Code. Su
responsabilidad es convertir un path SVG, themes, texturas y segmentos en un
canvas WebGL animado.

## Estado actual del repo

La implementacion actual vive en:

```txt
frontend/src/webgl-snake/WebGLSnake.svelte
frontend/src/webgl-snake/geometry.js
frontend/src/webgl-snake/materials.js
frontend/src/webgl-snake/materialPresets.ts
frontend/src/webgl-snake/postprocess.js
frontend/public/materials/snake-green/
```

`SnakeLayer.svelte` prepara dos segmentos:

- `unlocked`: tramo liquido verde/cyan;
- `locked`: tramo bloqueado graphite/purple con caps grises.

Ambos usan `materialEffectsV1` como base y `buildEffectFeatures()` para generar
features deterministas de highlights, wisps y cap specs.

## Responsabilidades

`WebGLSnake.svelte`:

- lazy-loadea `three`, `geometry.js`, `materials.js` y `postprocess.js`;
- samplea el SVG path;
- crea renderer, camera, scene y root group;
- carga texturas body/cap;
- ajusta texturas al limite de GPU;
- crea ribbon geometry y cap geometry;
- sincroniza segmentos y rangos visibles;
- aplica themes y presets a uniforms;
- mide tiempos internos con performance marks;
- expone stats en `window.__LUMEN_WEBGL_STATS__`;
- emite `lumen:webgl-first-rendered`.

## Geometry

`geometry.js` contiene la parte procedural:

- `sampleSnakePath()` convierte `pathD` en puntos con tangente y normal.
- `sliceSampledPath()` permite obtener tramos por rango normalizado.
- `createRibbonGeometry()` crea la malla del cuerpo.
- `createRoundCapGeometry()` crea caps grises simples.
- `createImageCapGeometry()` crea caps basados en textura.

La ruta visual no debe ser una imagen completa quemada. El renderer recibe
datos y construye geometria.

## Materials

`materials.js` define shaders y uniforms.

Modos actuales:

```txt
gray
raw
rawCaps
```

`rawCaps` combina textura, flujo, highlights, rim, glow y caps liquidos. Los
valores se empaquetan con `packValues()` para mantener uniforms estables.

## Postprocess

`postprocess.js` define `BloomPipeline`.

El pipeline renderiza una escena base y, si bloom esta activo, hace bright pass,
blur y composite. En superficies de menor potencia o webview se usan opciones
mas baratas.

## Performance

El renderer registra marcas como:

```txt
lumen:webgl-mounted
lumen:webgl-import
lumen:webgl-context
lumen:webgl-path-sample
lumen:webgl-pipeline
lumen:webgl-segments
lumen:webgl-textures
lumen:webgl-compile
lumen:webgl-first-render
```

`window.__LUMEN_WEBGL_STATS__` puede incluir:

```txt
renderWidth
renderHeight
effectiveRenderScale
renderCount
lastRenderMs
avgRenderMs
maxRenderMs
targetFrameInterval
bloom
bloomStrength
bloomRadius
```

Estas mediciones alimentan `perf.report` y los scripts CDP.

## Modo Visual Determinista

Si la URL contiene `lumenPerfVisual`, `SnakeLayer.svelte` pasa
`freezeTime: true` a los segmentos.

Ese modo existe para capturas visuales reproducibles. No es una opcion de
producto para usuarios.

## Reglas Deterministas

WebGL Snake no decide estado de ruta.

El path llega como dato.

Los colores llegan desde theme.

Los segmentos visibles se controlan por `rangeStart` y `rangeEnd`.

El renderer debe degradar costo en webview y mobile.

Las marcas de performance deben mantenerse como contrato para el harness.

## Resultado Esperado

Route Path View obtiene un camino vivo, procedural y tematizable.

La ruta puede animar el avance de gris a verde sin reconstruir toda la UI.

El equipo puede medir costo real de import, texturas, shader compile, primer
render y frames posteriores.
