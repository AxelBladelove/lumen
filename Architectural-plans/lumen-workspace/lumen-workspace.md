# Lumen Workspace

Archivo: `Architectural-plans/lumen-workspace/lumen-workspace.md`

## Propósito

`Lumen Workspace` define dónde vive Lumen y qué ocurre cuando el usuario abre Lumen desde VS Code.

## Estado actual del repo

La implementación actual solo detecta y reporta el estado del workspace; no
cambia de workspace todavía.

`extension/src/lumenEntryState.ts` calcula:

- `officialWorkspacePath` como `path.join(os.homedir(), ".lumen")`.
- `currentWorkspacePath` desde el primer workspace folder de VS Code.
- Si `~/.lumen` existe.
- Si el workspace actual es exactamente `~/.lumen`.
- La acción sugerida: `ready`, `workspace-switch-pending` o
  `workspace-missing`.

Ese estado se envía a la webview como parte de `lumen.entry.state` y se guarda
en `bootIntent` al entrar. Aún no se ejecuta `vscode.openFolder`, no se llama
`workspace.saveAll`, no se crea `.lumen` y no hay flujo de reparación si falta.

Este módulo existe porque Lumen no debe crear ejercicios dentro de cualquier proyecto que el usuario tenga abierto.

Si el usuario está trabajando en un proyecto personal y presiona el icono de Lumen, Lumen debe cambiar al workspace local oficial de Lumen antes de crear, importar o abrir ejercicios.

La regla principal es:

```txt
Lumen vive dentro de la carpeta .lumen del usuario.
Los ejercicios de Lumen viven dentro de .lumen.
Lumen no contamina proyectos personales.
```

## Raíz local oficial

La raíz local oficial de Lumen es:

```txt
C:\Users\<usuario>\.lumen
```

Esa carpeta se crea durante la instalación de Lumen.

Dentro de esa carpeta viven los datos, workspaces, ejercicios, base local, engine, configuración y estructura operativa de Lumen.

El nombre exacto del usuario cambia según Windows, pero la ubicación conceptual es siempre la misma:

```txt
users/
  nombre-del-usuario/
    .lumen/
```

## Qué es el workspace de Lumen

El workspace de Lumen es el espacio de trabajo que VS Code debe abrir para usar Lumen correctamente.

No es cualquier carpeta.

No es el proyecto personal del usuario.

No es el repo que el usuario tenía abierto antes.

Es la carpeta o workspace controlado por Lumen dentro de `.lumen`.

Conceptualmente:

```txt
.lumen/
  workspaces/
  data/
  engine/
  extension/
  settings/
```

La estructura exacta puede ajustarse, pero la raíz oficial no debe cambiar.

## Tech stack del módulo

Este módulo usa estas tecnologías del tech stack de Lumen:

- **VS Code Extension API**: para detectar el workspace actual, abrir el workspace de Lumen y coordinar la transición.
- **vscode.openFolder**: comando built-in usado para abrir `.lumen` en VS Code.
- **forceReuseWindow**: opción para abrir el workspace de Lumen en la misma ventana cuando sea posible.
- **workspace.saveAll**: API usada para guardar archivos sucios antes de cambiar al workspace de Lumen.
- **TypeScript**: implementación dentro del Extension Host.
- **Filesystem local**: validación de la existencia de `C:\Users\<usuario>\.lumen`.
- **Local Engine**: valida o prepara la estructura interna de `.lumen` cuando haga falta.
- **SQLite**: guarda estado útil para que Lumen sepa si debe entrar a bienvenida, Free Mode, Route Mode o último estado.

Tecnologías que no pertenecen a este módulo:

- **Cloudflare D1**: no decide el workspace local.
- **Cloudflare R2**: no abre el workspace local.
- **Webview Frontend**: muestra transición y pantallas, pero no decide dónde vive Lumen.
- **Exercise Collection**: usa el workspace, pero no lo define.

## Comportamiento esperado al abrir Lumen

Cuando el usuario presiona el icono de Lumen, Lumen debe revisar el workspace actual.

Si el workspace actual ya es `.lumen`, Lumen puede entrar directamente a Lumen Mode.

Si el workspace actual no es `.lumen`, Lumen debe cambiar a la carpeta `.lumen` antes de iniciar la experiencia de Lumen.

El comportamiento esperado es:

```txt
Usuario presiona icono de Lumen
Lumen detecta workspace actual
Si ya está en .lumen:
  entra a Lumen Mode
Si no está en .lumen:
  guarda cambios si hace falta
  abre .lumen en la misma ventana
  reactiva Lumen en el nuevo workspace
  entra a Lumen Mode
```

## Misma ventana por default

El comportamiento default debe ser abrir `.lumen` en la misma ventana de VS Code.

Esto evita abrir otra ventana innecesaria y mantiene la experiencia simple.

La acción esperada es usar `vscode.openFolder` con opción equivalente a `forceReuseWindow`.

Conceptualmente:

```ts
vscode.commands.executeCommand(
  "vscode.openFolder",
  lumenWorkspaceUri,
  { forceReuseWindow: true }
)
```

La implementación exacta puede ajustarse, pero la intención es clara:

```txt
Lumen reemplaza el workspace actual por el workspace de Lumen en la misma ventana.
```

## Reinicio del Extension Host

Abrir otro folder o workspace en la misma ventana puede reiniciar el Extension Host.

Eso significa que la extensión que inició el cambio puede apagarse y volver a activarse dentro del workspace nuevo.

Lumen debe diseñarse esperando ese comportamiento.

No debe asumir que después de ejecutar `vscode.openFolder` el mismo proceso de la extensión seguirá corriendo como si nada.

Por eso, antes de abrir `.lumen`, Lumen debe guardar una intención de arranque.

Ejemplo conceptual:

```txt
pendingLumenOpen = true
requestedMode = last/use-selection/free/route
```

Después de que VS Code abra `.lumen` y la extensión se active de nuevo, Lumen lee esa intención y continúa la secuencia.

## Boot intent

`Boot intent` es el estado temporal que indica que Lumen debe continuar abriéndose después de cambiar de workspace.

Hace falta porque cambiar a `.lumen` puede reiniciar la extensión.

El boot intent debe guardar lo mínimo necesario:

- Que el usuario pidió abrir Lumen.
- Si venía de fuera de `.lumen`.
- Qué modo se quería abrir, si ya estaba decidido.
- Si debe mostrar bienvenida, selección de modo o último estado útil.
- Timestamp para evitar intents viejos.

El boot intent no debe guardar datos pesados ni reemplazar la base local.

Es solo una señal de continuidad.

## Workspace anterior

Si el usuario estaba en otro proyecto, ese proyecto debe quedar intacto.

Lumen no debe crear carpetas dentro de ese proyecto.

No debe mover archivos.

No debe modificar su configuración.

No debe agregar `.lumen` como carpeta extra al workspace personal.

El comportamiento default es cerrar/reemplazar ese workspace en la ventana actual al abrir `.lumen`.

El proyecto anterior sigue existiendo en disco, simplemente deja de ser el workspace abierto en esa ventana.

## Archivos sin guardar

Antes de cambiar al workspace de Lumen, Lumen debe manejar archivos sin guardar.

Si hay archivos sucios, Lumen debe intentar guardar o pedir confirmación según el comportamiento elegido.

La regla segura es:

```txt
Si hay archivos sin guardar:
  intentar guardar con saveAll o pedir confirmación.
Si el guardado falla o el usuario cancela:
  cancelar entrada a Lumen.
Si el guardado termina bien:
  abrir .lumen.
```

Lumen no debe provocar que el usuario pierda cambios en un proyecto personal.

## No mezclar workspaces

Lumen no debe usar `updateWorkspaceFolders` como comportamiento default para agregar `.lumen` al workspace actual.

Agregar `.lumen` al proyecto personal mezclaría contextos.

Eso podría hacer que el usuario vea ejercicios de Lumen junto a su proyecto real, o que Lumen cree archivos donde no debe.

La regla es:

```txt
No mezclar proyecto personal + .lumen en el mismo workspace por default.
```

Si en el futuro se permite multi-root, debe ser una opción avanzada y explícita.

## Prohibición de contaminar proyectos personales

Lumen nunca debe crear ejercicios dentro de un workspace que no sea `.lumen`.

Si el usuario está en:

```txt
C:\Users\<usuario>\Documents\mi-proyecto-personal
```

y presiona Lumen, Lumen no debe crear:

```txt
mi-proyecto-personal/
  ejercicios/
```

ni:

```txt
mi-proyecto-personal/
  .lumen/
```

Lumen debe abrir:

```txt
C:\Users\<usuario>\.lumen
```

y trabajar desde ahí.

## Detección de workspace de Lumen

Lumen debe poder detectar si el workspace actual es el workspace oficial de Lumen.

Puede hacerlo comparando la ruta raíz del workspace actual con la ruta esperada de `.lumen`.

También puede usar un archivo marcador interno.

Ejemplo conceptual:

```txt
.lumen/
  lumen.workspace.json
```

o:

```txt
.lumen/
  .lumen-root
```

El método exacto puede definirse en implementación, pero debe existir una forma clara y confiable de saber si VS Code ya está dentro de Lumen.

## Primera apertura después del instalador

Después de instalar Lumen, el instalador puede abrir VS Code apuntando directamente a `.lumen`.

En ese caso, Lumen ya estará dentro del workspace correcto.

La extensión debe detectar eso y continuar con la primera experiencia:

```txt
Abrir VS Code en .lumen
Activar extensión
Mostrar transición
Entrar a Lumen Mode
Mostrar bienvenida o selección de modo
```

El instalador no debe abrir VS Code en una carpeta aleatoria.

## Apertura manual desde proyecto externo

Si el usuario abre VS Code manualmente en otro proyecto y luego presiona Lumen, la extensión debe llevarlo a `.lumen`.

Este flujo es importante porque Lumen no siempre será abierto desde el instalador.

El icono de Lumen debe funcionar como puerta de entrada incluso cuando el usuario estaba haciendo otra cosa.

## Entrada después de abrir .lumen

Una vez VS Code está dentro de `.lumen`, Lumen puede ejecutar su flujo normal.

Ese flujo pertenece a otros documentos:

- `enter-lumen-mode.md`
- `lumen-mode-layout.md`
- `free-mode.md`
- `route-mode.md`
- `exercise-workspace.md`

`Lumen Workspace` solo garantiza que la ventana correcta está abierta antes de entrar al modo visual de Lumen.

## Relación con Exercise Workspace

Exercise Workspace depende de Lumen Workspace.

Primero Lumen debe estar dentro de `.lumen`.

Después Exercise Workspace puede crear o abrir ejercicios dentro de la estructura local.

La relación es:

```txt
Lumen Workspace define la raíz.
Exercise Workspace define las carpetas internas de ejercicios.
```

Sin Lumen Workspace, Exercise Workspace podría crear ejercicios en un lugar incorrecto.

## Relación con Extension Host

El Extension Host ejecuta la transición inicial.

Debe detectar workspace actual, guardar cambios si hace falta y abrir `.lumen`.

También debe manejar el hecho de que al cambiar workspace puede reiniciarse.

Por eso debe usar boot intent o un mecanismo equivalente.

## Relación con Local Engine

El Local Engine puede validar que `.lumen` esté correctamente preparado.

Puede verificar que existan carpetas necesarias, base local, workspace interno y estructura mínima.

Si falta algo, puede repararlo o devolver error controlado.

El Extension Host abre el workspace.

El Local Engine valida la estructura.

## Relación con Installer

El instalador crea `.lumen`.

Este documento no define el instalador completo, pero sí depende de que el instalador haya preparado la raíz local.

Si `.lumen` no existe, Lumen debe mostrar un error claro o iniciar un flujo de reparación.

No debe crear estructura incompleta silenciosamente si eso puede dejar Lumen roto.

## Relación con Session Memory

Session Memory debe recordar último modo, último ejercicio y estado útil.

Lumen Workspace solo abre la raíz correcta.

Después de abrir `.lumen`, Session Memory puede decidir si toca bienvenida, selección de modo, Free Mode, Route Mode o último ejercicio.

## Misma ventana vs nueva ventana

El default oficial es misma ventana.

Razón:

- Experiencia más simple.
- No abre VS Code duplicado.
- Se siente como entrar a Lumen desde el editor actual.
- Evita confusión de múltiples ventanas.

Abrir en nueva ventana puede existir como opción futura.

La opción futura podría llamarse:

```txt
lumen.workspace.openInNewWindow
```

Pero no es el default.

## Cancelación

Si el usuario cancela el guardado de archivos, Lumen no debe abrir `.lumen`.

Si no existe `.lumen`, Lumen debe cancelar y mostrar un error o reparación.

Si `vscode.openFolder` falla, Lumen debe mostrar error controlado.

Si el boot intent es viejo o inválido, Lumen no debe entrar automáticamente a Lumen Mode.

## Fallos esperados

Lumen Workspace debe manejar estos fallos:

- `.lumen` no existe.
- `.lumen` no tiene permisos.
- VS Code no puede abrir la carpeta.
- Hay archivos sin guardar y el usuario cancela.
- `saveAll` falla.
- El Extension Host se reinicia y no encuentra boot intent.
- Boot intent viejo.
- Workspace actual ya es `.lumen` pero falta estructura interna.
- Ruta del usuario tiene espacios.
- El instalador dejó estructura incompleta.

Todos esos casos deben mostrar errores controlados.

## Reglas deterministas

Lumen vive en `C:\Users\<usuario>\.lumen`.

Lumen no crea ejercicios fuera de `.lumen`.

Al abrir Lumen desde otro proyecto, Lumen cambia a `.lumen`.

El default es abrir `.lumen` en la misma ventana.

El workspace anterior se guarda si hace falta y deja de estar abierto en esa ventana.

Lumen no mezcla `.lumen` con proyectos personales por default.

Cambiar de workspace puede reiniciar el Extension Host.

Lumen debe usar boot intent para continuar después del cambio.

Si no se puede guardar el proyecto anterior, no se entra a Lumen.

Si `.lumen` no existe, no se improvisa un workspace roto.

## Resultado esperado

El usuario puede estar trabajando en cualquier proyecto.

Presiona el icono de Lumen.

Lumen guarda o protege el trabajo actual.

VS Code cambia a `C:\Users\<usuario>\.lumen` en la misma ventana.

La extensión se reactiva dentro del workspace correcto.

Lumen entra a su experiencia normal.

Los ejercicios se crean, importan y resuelven dentro de `.lumen`.

El proyecto personal del usuario queda limpio e intacto.
