# Exit Lumen Mode

Archivo: `Architectural-plans/extension-host/lumen-mode/exit-lumen-mode.md`

## Propósito

`Exit Lumen Mode` define qué ocurre cuando el usuario sale de Lumen Mode.

## Estado actual del repo

`lumen.exitMode` implementa la salida mínima de layout: cierra el
`WebviewPanel` de Lumen y su grupo de editor, sale de Zen Mode, revierte los
settings desde el snapshot guardado al entrar (los `zenMode.*`), borra el
`bootIntent` y actualiza context keys (`lumen.inMode = false`,
`lumen.mode = undefined`). La vista del Activity Bar `lumen.routePath` queda
como launcher liviano, lista para iniciar otra entrada.

`workbench.sideBar.location` ya no se escribe en sesiones nuevas porque la UI
principal no vive en el sidebar. Si una sesión previa dejó esa clave dentro del
snapshot de restauración, la limpieza la restaura igualmente para migrar el
estado viejo.

`Esc` ejecuta `lumen.exitMode` por dos vías equivalentes: un keybinding
contribuido (activo solo con `lumen.inMode`, con guardas para no robar Escape
a widgets temporales) cuando el foco está fuera de la webview, y el mensaje de
protocolo `lumen.exit.requested` que emite el frontend cuando el foco está
dentro de la webview. Si una sesión muere dentro del modo (reload/crash), la
siguiente activación de la extensión restaura los settings desde el snapshot.

Todavía no guarda último ejercicio, último archivo, último modo real ni ruta
activa, ni maneja UI temporal (`lumen.temporaryUiOpen`), compilaciones en curso
o Ask Tutor, porque esas piezas no existen en el repo actual.

Esta feature no documenta cómo se entra a Lumen Mode, ni cómo funciona Modo Ruta, Modo Libre, Ask Tutor o la compilación.

Su responsabilidad es definir cómo Lumen desactiva su modo enfocado, limpia sus estados temporales, guarda la sesión actual y devuelve VS Code a un estado normal.

Salir de Lumen Mode debe ser rápido, claro y seguro.

El usuario nunca debe sentir que Lumen lo dejó atrapado en una configuración extraña de VS Code.

## Punto de salida

La salida principal de Lumen Mode es `Esc`.

Cuando el usuario presiona `Esc` y no hay ninguna interacción temporal abierta, Lumen debe ejecutar:

```txt
lumen.exitMode
```

También debe existir una forma visible de salir desde la UI de Lumen, normalmente como botón o acción clara.

El comando de salida debe estar disponible desde Command Palette como:

```txt
Lumen: Exit Mode
```

## Regla de Escape

`Esc` no siempre debe cerrar Lumen Mode directamente.

Si hay una mini ventana, prompt, selector, input, menú temporal, Ask Tutor abierto, peripista visible o interacción contextual activa, `Esc` debe cerrar primero esa interacción.

Solo cuando no haya ninguna UI temporal abierta, `Esc` debe salir de Lumen Mode.

La regla es:

```txt
Primero se cierra lo temporal.
Después se sale de Lumen Mode.
```

Esto evita que el usuario pierda el modo completo cuando solo quería cerrar una pequeña interacción.

## Secuencia de salida

Al ejecutar `lumen.exitMode`, Lumen debe seguir esta secuencia:

1. Detectar si existe una interacción temporal activa.
2. Si existe, cerrar esa interacción y detener la salida completa.
3. Si no existe, guardar el estado útil de la sesión actual.
4. Guardar el último modo usado.
5. Guardar el último ejercicio activo, si existe.
6. Guardar el archivo activo, si aplica.
7. Cerrar el panel de editor de Lumen y el grupo vacío que queda a la derecha.
8. Desactivar los keybindings contextuales de Lumen.
9. Desactivar el estado interno `lumen.inMode`.
10. Restaurar la interfaz normal de VS Code tanto como sea posible.
11. Dejar a VS Code en un estado estable y usable.

La salida no debe depender de cerrar VS Code.

Salir de Lumen Mode no significa cerrar el workspace ni borrar el estado del usuario.

## Estado que debe guardarse

Antes de salir, Lumen debe guardar el estado mínimo necesario para poder continuar después.

Debe guardar:

```txt
Último modo usado.
Último ejercicio activo.
Último archivo de trabajo.
Última ruta activa, si aplica.
Estado de ejercicio pendiente, si aplica.
Información mínima de sesión.
```

No debe guardar basura temporal.

No debe guardar estados visuales que pertenezcan a una mini ventana ya cerrada.

El objetivo es que, si el usuario vuelve a entrar a Lumen Mode, `enter-lumen-mode.md` pueda recuperar el último estado útil.

## Qué debe restaurar

Al salir de Lumen Mode, VS Code debe dejar de estar en el layout enfocado de Lumen.

Lumen debe revertir el estado visual que activó para su modo.

Debe restaurar o limpiar:

```txt
lumen.inMode
lumen.temporaryUiOpen
lumen.mode
lumen.hasActiveExercise
lumen.hasSelection si fue usado como estado interno
keybindings contextuales de Lumen
vistas temporales de Lumen
estado de transición si seguía activo
```

Lumen también debe salir del layout default de Lumen Mode.

Si Lumen activó Zen Mode para entrar, la salida debe desactivar esa experiencia enfocada o devolver VS Code a un estado normal.

Si Lumen ocultó el gestor de archivos, paneles o vistas como parte del modo, debe dejar de imponer ese estado al salir.

## Qué no debe hacer

Salir de Lumen Mode no debe borrar ejercicios.

No debe eliminar carpetas.

No debe resetear progreso.

No debe cerrar VS Code.

No debe cerrar el workspace completo.

No debe modificar permanentemente la configuración del usuario sin consentimiento.

No debe dejar keybindings especiales activos fuera de Lumen Mode.

No debe dejar una pantalla de carga, transición o webview bloqueando el editor.

## Salida desde Modo Ruta

En Modo Ruta, salir de Lumen Mode debe guardar el punto actual de la ruta.

Si había un ejercicio abierto, debe quedar registrado como ejercicio pendiente o último ejercicio activo.

El gestor de archivos estaba oculto en Modo Ruta, pero al salir Lumen no debe seguir forzando ese estado.

Después de salir, VS Code debe volver a comportarse como VS Code normal.

La ruta no se abandona.

Solo se abandona el modo visual enfocado.

## Salida desde Modo Libre

En Modo Libre, salir de Lumen Mode debe guardar el último espacio de trabajo libre.

Si el usuario tenía un ejercicio propio o importado abierto, Lumen debe recordarlo como último estado útil.

Si el usuario había ocultado o mostrado el gestor de archivos con `Ctrl + B`, esa decisión puede mantenerse durante la sesión activa, pero no debe convertirse en una regla permanente del producto.

Modo Libre debe poder recuperarse después sin perder el archivo activo.

## Salida durante la transición

Si el usuario intenta salir mientras la transición de logo y wordmark todavía está activa, Lumen debe cancelar la entrada de forma segura.

No debe quedar a mitad de camino.

Debe cancelar la transición, limpiar estados temporales y devolver VS Code a un estado normal.

Si ya se habían aplicado algunos cambios de layout, deben revertirse.

La transición no debe bloquear al usuario.

## Salida durante Ask Tutor

Si Ask Tutor está abierto, `Esc` debe cerrar primero Ask Tutor.

No debe salir inmediatamente de Lumen Mode.

Si el usuario vuelve a presionar `Esc` después de cerrar Ask Tutor, entonces sí puede salir de Lumen Mode.

Ask Tutor debe guardar solo lo que corresponda a su propio módulo. `Exit Lumen Mode` no debe encargarse de guardar conversaciones profundas del tutor.

## Salida durante compilación

Si el usuario intenta salir mientras una compilación está en curso, Lumen debe evitar dejar procesos colgados.

El comportamiento exacto de compilación vive en su propio módulo, pero `Exit Lumen Mode` debe pedirle al módulo de compilación que cierre, cancele o desacople cualquier proceso temporal según corresponda.

Si existe una ventana externa de ejecución, Lumen debe decidir mediante el módulo de compilación si la deja abierta, la cierra o pregunta al usuario.

Este documento no define esa política profunda. Solo exige que salir de Lumen Mode no deje el sistema en estado inconsistente.

## Botón de salida

La UI de Lumen debe tener una salida visible.

Esa salida puede mostrarse como botón, acción de panel o elemento contextual, pero debe ser fácil de descubrir.

El botón debe ejecutar el mismo comando que `Esc`:

```txt
lumen.exitMode
```

No debe existir una salida por botón y otra salida por teclado con comportamientos diferentes.

Botón y comando deben compartir la misma lógica.

## Command Palette

`Lumen: Exit Mode` debe existir en Command Palette.

Debe estar disponible cuando `lumen.inMode == true`.

Si Lumen Mode no está activo, el comando puede estar oculto o aparecer deshabilitado.

## Estados internos

Al salir de Lumen Mode, el estado interno debe quedar limpio.

Como mínimo:

```txt
lumen.inMode = false
lumen.temporaryUiOpen = false
```

Los estados relacionados con modo, ejercicio activo o sesión no necesariamente se borran. Se guardan como memoria útil para volver después.

La diferencia es importante:

```txt
Estado de modo activo se limpia.
Estado útil de sesión se guarda.
```

## Contratos con otros módulos

`enter-lumen-mode` depende de que este módulo guarde el último estado útil antes de salir.

`lumen-mode-layout` debe ofrecer una forma de dejar de imponer el layout default de Lumen.

`lumen-mode-keybindings` debe desactivar los shortcuts especiales cuando `lumen.inMode` pasa a `false`.

`lumen-mode-help` debe cerrar cualquier hover, mini card o ayuda contextual activa.

`session-memory` recibe el último modo, ejercicio, ruta y archivo útil antes de salir.

`route-mode` informa cuál es el punto actual de la ruta.

`free-mode` informa cuál es el ejercicio, carpeta o archivo activo.

`compile-current-exercise` debe evitar que salir del modo deje procesos o ventanas en estado roto.

`ask-tutor` debe cerrar su mini experiencia si estaba activa.

## Reglas deterministas

`Esc` sale de Lumen Mode solo si no hay UI temporal activa.

El botón de salida ejecuta `lumen.exitMode`.

Command Palette debe tener `Lumen: Exit Mode`.

Salir guarda el último estado útil.

Salir desactiva `lumen.inMode`.

Salir limpia UI temporal.

Salir no borra progreso.

Salir no borra ejercicios.

Salir no cierra VS Code.

Salir no debe dejar keybindings de Lumen activos.

Salir debe devolver VS Code a un estado normal.

## Resultado esperado

Después de ejecutar `lumen.exitMode`, VS Code debe volver a sentirse como VS Code normal.

Lumen deja de imponer su layout.

Los comandos especiales de Lumen dejan de estar activos.

La sesión útil queda guardada.

El usuario puede volver a entrar a Lumen Mode después y continuar donde se quedó.
