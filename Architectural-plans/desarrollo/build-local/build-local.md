# Build Local

Archivo: `Architectural-plans/desarrollo/build-local/build-local.md`

## Proposito

`Build Local` documenta el flujo para que la ventana normal de VS Code use la
version actual de este workspace.

Este documento existe porque VS Code no carga automaticamente el codigo fuente
del repo cuando la extension ya esta instalada. La ventana normal usa una copia
separada bajo `~/.vscode/extensions`.

## Estado actual del repo

El flujo actual esta implementado con:

```txt
scripts/install-local.mjs
package.json
```

Scripts:

```txt
bun run install:local
bun run build:local
```

`build:local` ejecuta primero `bun run build` y despues sincroniza archivos a
la extension instalada.

## Que Copia

`install-local.mjs` resuelve el destino desde `publisher`, `name` y `version`
del `package.json` raiz:

```txt
~/.vscode/extensions/lumen.lumen-0.0.1
```

Copia:

```txt
extension/out
frontend/dist
assets
package.json
README.md
```

No instala la extension por primera vez. Si el destino no existe, el script
falla y pide instalar un `.vsix` una vez.

## Uso Esperado

Despues de cambiar codigo:

```txt
bun run build:local
```

Luego, en VS Code:

```txt
Developer: Reload Window
```

Copiar archivos no reinicia el Extension Host ya cargado. La recarga de ventana
es necesaria para que VS Code lea la copia nueva.

## Relacion con el Host de Desarrollo

El host de desarrollo de extensiones de VS Code y los scripts CDP pueden
ejecutar codigo desde este workspace sin actualizar la extension instalada.

Eso significa que hay dos mundos:

```txt
Dev host / CDP: sirve para medir y depurar.
VS Code normal: usa ~/.vscode/extensions.
```

`build:local` existe para mantener ambos mundos alineados cuando el usuario
quiere ver la extension en su ventana normal.

## Reglas Deterministas

`install:local` no compila.

`build:local` compila y sincroniza.

El destino depende de `publisher.name-version`.

La extension debe recargarse despues de sincronizar.

Este flujo es local de desarrollo, no instalador final de Lumen.

## Resultado Esperado

El usuario puede probar cambios recientes en su VS Code normal sin reconstruir
manualmente un `.vsix` en cada iteracion.
