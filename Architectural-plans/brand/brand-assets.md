# Brand Assets

Archivo: `Architectural-plans/brand/brand-assets.md`

## Proposito

`Brand Assets` documenta los assets de marca que usa la extension y el
frontend.

No define identidad visual completa ni marketing. Su responsabilidad es indicar
que archivos existen hoy, donde se consumen y que reglas deben respetarse al
usarlos dentro de la webview.

## Estado actual del repo

Assets actuales:

```txt
assets/brand/lumen-logo.svg
assets/brand/lumen-editor-icon.svg
assets/brand/lumen-activitybar-icon.svg
assets/brand/Lumen WordMark.png
assets/brand/lumen-wordmark.webp
```

El frontend importa:

```txt
frontend/src/brand/lumenBrand.ts
```

`lumenBrand.ts` exporta:

```txt
name
logoUrl
wordmarkUrl
ensureLumenFavicon()
```

## Uso en VS Code

`package.json` usa:

```txt
assets/brand/lumen-editor-icon.svg
assets/brand/lumen-activitybar-icon.svg
```

El provider usa `lumen-logo.svg` como favicon y como imagen del fallback cuando
falta el build.

## Uso en Frontend

`App.svelte` usa:

```txt
lumenBrand.logoUrl
lumenBrand.wordmarkUrl
```

La pantalla de entrada del mock muestra logo + wordmark y fuerza prioridad alta
de carga para evitar que la marca aparezca tarde.

`ensureLumenFavicon()` actualiza o crea el `<link rel="icon">` del documento
cuando corre la app.

## Reglas Deterministas

La marca de Lumen no debe depender del theme del modulo.

El intro usa color/asset de Lumen, no color de Ruta C.

Los iconos de VS Code deben seguir disponibles desde `assets/brand`.

El wordmark runtime preferido para la webview es `.webp`.

Si se reemplaza el wordmark, debe actualizarse `lumenBrand.ts`.

## Resultado Esperado

La extension, el fallback HTML y la pantalla de entrada muestran una marca
coherente.

Los assets de producto quedan separados de los assets tematicos de Route Path
View.
