# Lumen Mode Keybindings

Archivo: `Architectural-plans/extension-host/lumen-mode/lumen-mode-keybindings.md`

## Propósito

`Lumen Mode Keybindings` define los comandos y atajos de teclado activos cuando Lumen Mode está encendido.

## Estado actual del repo

Los comandos existentes en `package.json` son:

```txt
lumen.open
lumen.enterMode
lumen.exitMode
lumen.engineStatus
lumen.refreshWebview
lumen.compileCurrentExercise
lumen.testCurrentExercise
lumen.importExercise
```

El repo contribuye tres keybindings:

```txt
Esc -> lumen.exitMode
F9  -> lumen.compileCurrentExercise
F10 -> lumen.testCurrentExercise
```

`Esc` está activo solo con `lumen.inMode` y con guardas de UI temporal
(`!inQuickOpen`, `!suggestWidgetVisible`, `!findWidgetVisible`, etc.). Cuando
el foco está dentro de la webview de Lumen, VS Code no evalúa keybindings de
extensión de forma fiable, así que el frontend escucha `Escape` y emite el
mensaje `lumen.exit.requested`; el Extension Host lo traduce a
`lumen.exitMode`. Botón/tecla y comando comparten así la misma lógica.

`F9` y `F10` resuelven el mismo entrypoint activo del Engine Protocol v5. Sus
guardas exigen `lumen.inMode`, `lumen.hasActiveExercise` y foco en el editor;
no invaden proyectos C fuera de Lumen ni prueban un ejercicio diferente al que
compilan.

No existen todavía `lumen.askTutor` ni los keybindings de `Ctrl + Shift + R` o
`Ctrl + B` propios de Lumen. La extensión setea `lumen.inMode` y `lumen.mode`,
la base de los `when` futuros. `lumen.hasActiveExercise` ya refleja una working
copy lista; `lumen.temporaryUiOpen` y `lumen.hasSelection` todavía no se setean.

Tambien existen scripts npm/Bun para build local y performance, pero no son
comandos contribuidos a VS Code.

Este documento no explica profundamente qué hace cada feature. No documenta la compilación, Ask Tutor, Exit Mode ni Command Palette por dentro.

Su responsabilidad es fijar qué comandos existen, qué shortcut los activa, cuándo están activos y qué reglas deben seguir para no romper la experiencia normal de VS Code.

## Principio de diseño

Toda acción importante de Lumen debe existir en dos formas:

Como botón visible en la UI.

Como comando ejecutable con teclado o desde Command Palette.

Los botones sirven para descubrir.

Los comandos sirven para trabajar rápido.

Lumen debe enseñar al usuario a moverse como programador, no solo como usuario de botones.

## Contexto de activación

Los keybindings de Lumen Mode deben activarse solo cuando Lumen Mode está activo.

El estado base para eso es:

```txt
lumen.inMode == true
```

Los shortcuts de Lumen no deben invadir VS Code fuera de Lumen Mode.

Cuando el usuario sale de Lumen Mode, los keybindings especiales de Lumen dejan de estar activos.

## Comandos base

Estos son los comandos base de Lumen Mode:

```txt
Esc              -> lumen.exitMode
F9               -> lumen.compileCurrentExercise
Ctrl + Shift + R -> lumen.askTutor
Ctrl + B         -> workbench.action.toggleSidebarVisibility
Ctrl + Shift + P -> workbench.action.showCommands
```

`Ctrl + Shift + P` no es un comando propio de Lumen. Se conserva porque es la entrada natural a Command Palette.

`Ctrl + B` tampoco es un comando propio de Lumen. Se usa para mostrar u ocultar el gestor de archivos cuando el modo actual lo permite.

## Escape

`Esc` es la salida rápida de Lumen Mode.

Si no hay ningún estado temporal abierto, `Esc` ejecuta:

```txt
lumen.exitMode
```

Si hay una mini ventana, prompt, input, selector, tooltip interactivo o UI temporal abierta, `Esc` debe cerrar primero esa interacción.

Solo cuando no queda interacción temporal activa, `Esc` sale de Lumen Mode.

La lógica profunda de salida vive en:

```txt
exit-lumen-mode.md
```

## F9

`F9` compila el ejercicio actual.

Este shortcut debe estar disponible dentro de Lumen Mode cuando exista un ejercicio activo o un archivo compatible con Lumen.

El comando asociado es:

```txt
lumen.compileCurrentExercise
```

El comportamiento profundo de compilación vive en el módulo de compilación correspondiente.

Este documento solo fija que `F9` es el shortcut oficial para compilar dentro de Lumen Mode.

## Ctrl + Shift + R

`Ctrl + Shift + R` abre Ask Tutor.

El comando asociado es:

```txt
lumen.askTutor
```

Si el usuario tiene una selección activa en el editor, Ask Tutor debe recibir esa selección como contexto inicial.

Si no hay selección, Ask Tutor debe usar el contexto general del ejercicio actual.

La experiencia profunda de Ask Tutor vive en su propio módulo.

Este documento solo fija que `Ctrl + Shift + R` es el shortcut oficial para invocar Ask Tutor dentro de Lumen Mode.

## Ctrl + B

`Ctrl + B` mantiene su comportamiento base de VS Code: mostrar u ocultar el gestor de archivos o sidebar principal.

En Lumen Mode, `Ctrl + B` se usa especialmente en Modo Libre.

En Modo Libre, el gestor de archivos está visible por default y `Ctrl + B` permite ocultarlo o volverlo a mostrar.

En Modo Ruta, el gestor de archivos está oculto por default. Si más adelante se permite mostrarlo manualmente, eso debe documentarse como excepción o configuración avanzada.

## Ctrl + Shift + P

`Ctrl + Shift + P` abre Command Palette.

Lumen debe registrar sus comandos importantes para que puedan encontrarse desde Command Palette.

Los comandos de Lumen deben tener nombres claros y agrupados bajo la categoría `Lumen`.

Ejemplos de nombres esperados:

```txt
Lumen: Enter Mode
Lumen: Exit Mode
Lumen: Compile Current Exercise
Lumen: Ask Tutor
Lumen: Open Exercise Bank
Lumen: Switch Mode
```

## Botones equivalentes

Cada comando importante debe tener un botón equivalente en la UI cuando sea relevante para el estado actual.

El usuario debe poder descubrir una acción con el mouse y luego aprender su shortcut.

Ejemplo:

El botón de compilar debe mostrar que su shortcut es `F9`.

El botón de Ask Tutor debe mostrar que su shortcut es `Ctrl + Shift + R`.

El botón de salir debe mostrar que su shortcut es `Esc`.

## Ayuda contextual

Los keybindings principales deben aparecer en la ayuda contextual de Lumen Mode.

La ayuda contextual no debe explicar profundamente cada comando. Solo debe recordarle al usuario qué puede hacer ahora.

En Modo Ruta, la ayuda debe priorizar:

```txt
Esc
F9
Ctrl + Shift + R
Ctrl + Shift + P
```

En Modo Libre, la ayuda debe incluir también:

```txt
Ctrl + B
```

## Reglas de conflicto

Lumen no debe robar shortcuts globales de VS Code fuera de Lumen Mode.

Si un shortcut entra en conflicto con una acción importante de VS Code, Lumen debe limitarlo con contexto.

Los keybindings deben depender de estados como:

```txt
lumen.inMode == true
lumen.hasActiveExercise == true
lumen.mode == route
lumen.mode == free
lumen.hasSelection == true
```

Los nombres exactos de context keys pueden cambiar en implementación, pero la idea debe mantenerse: cada shortcut se activa solo cuando tiene sentido.

## Ejemplo conceptual de keybindings

Este ejemplo no es implementación final, pero muestra la intención:

```json
[
  {
    "key": "f9",
    "command": "lumen.compileCurrentExercise",
    "when": "lumen.inMode && lumen.hasActiveExercise"
  },
  {
    "key": "ctrl+shift+r",
    "command": "lumen.askTutor",
    "when": "lumen.inMode"
  },
  {
    "key": "escape",
    "command": "lumen.exitMode",
    "when": "lumen.inMode && !lumen.temporaryUiOpen"
  },
  {
    "key": "ctrl+b",
    "command": "workbench.action.toggleSidebarVisibility",
    "when": "lumen.inMode && lumen.mode == free"
  }
]
```

## Contratos con otros módulos

`enter-lumen-mode` activa el estado `lumen.inMode` para que estos keybindings puedan funcionar.

`exit-lumen-mode` desactiva `lumen.inMode` y limpia los contextos temporales del modo.

`lumen-mode-layout` define cuándo el gestor de archivos está visible u oculto, lo cual afecta especialmente a `Ctrl + B`.

`lumen-mode-help` muestra los shortcuts disponibles según el estado actual.

`compile-current-exercise` implementa el comportamiento real de `F9`.

`ask-tutor` implementa el comportamiento real de `Ctrl + Shift + R`.

`session-memory` puede recordar preferencias o último modo, pero no debe cambiar el significado base de los shortcuts.

## Reglas deterministas

`Esc` sale de Lumen Mode cuando no hay una UI temporal abierta.

`F9` compila el ejercicio actual.

`Ctrl + Shift + R` abre Ask Tutor.

`Ctrl + B` controla el gestor de archivos en Modo Libre.

`Ctrl + Shift + P` abre Command Palette.

Los shortcuts de Lumen solo viven dentro de Lumen Mode.

Los comandos importantes deben aparecer también como botones cuando corresponda.

Los botones importantes deben mostrar su shortcut.

Los comandos de Lumen deben poder encontrarse desde Command Palette.

## Resultado esperado

Cuando Lumen Mode está activo, el usuario puede usar Lumen sin depender únicamente de botones.

El usuario puede compilar, pedir ayuda, abrir Command Palette, mostrar u ocultar el gestor de archivos en Modo Libre y salir del modo usando teclado.

Cuando Lumen Mode está apagado, VS Code debe volver a comportarse como VS Code normal.
