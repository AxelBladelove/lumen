# Lumen Mode Layout

Archivo: `Architectural-plans/extension-host/lumen-mode/lumen-mode-layout.md`

## Propósito

`Lumen Mode Layout` define cómo debe quedar visualmente VS Code cuando Lumen Mode está activo.

## Estado actual del repo

El layout completo de Lumen Mode todavía no está implementado.

La extensión actual solo contribuye:

- Un contenedor de Activity Bar `lumen`.
- Una Webview View `lumen.routePath` llamada `Ruta C`.
- Comandos para abrir, entrar, salir y refrescar la webview.

`lumen.enterMode` abre `workbench.view.extension.lumen` e intenta enfocar
`lumen.routePath`, pero no activa Zen Mode, no oculta Activity Bar, Status Bar,
tabs, line numbers o panel inferior, no posiciona un panel derecho dedicado y
no distingue layout real de Modo Ruta vs Modo Libre. Todo lo que sigue en este
documento es el layout objetivo.

Este documento no explica cómo se entra a Lumen Mode, ni qué hace cada comando, ni cómo funciona Modo Ruta o Modo Libre por dentro. Su responsabilidad es fijar el layout default de Lumen: qué se muestra, qué se oculta, dónde aparece cada vista y qué configuración visual debe aplicarse.

El layout de Lumen Mode debe ser determinista. No debe depender del layout previo del usuario ni quedar a interpretación de la IA o del programador.

## Principio del layout

Lumen Mode debe convertir VS Code en un entorno de estudio enfocado.

El layout default debe eliminar distracciones y dejar visible únicamente lo necesario para trabajar con Lumen.

La estructura visual base de Lumen Mode es:

* Código en el centro.
* Lumen a la derecha.
* Gestor de archivos solo cuando el modo lo requiere.

Modo Ruta y Modo Libre no usan exactamente el mismo layout.

En Modo Ruta, el gestor de archivos debe estar oculto.

En Modo Libre, el gestor de archivos debe estar visible por default y debe poder ocultarse o mostrarse con `Ctrl + B`.

## Transición de layout

Cuando el usuario ejecuta `lumen.enterMode`, Lumen debe mostrar una pantalla de transición con el logo y el wordmark.

Mientras esa pantalla está visible, Lumen aplica en background la configuración visual del modo.

La transición existe para evitar que el usuario vea VS Code reorganizándose de forma desordenada.

El orden esperado es:

1. El usuario presiona el icono de Lumen.
2. Aparece la pantalla de transición de Lumen.
3. Lumen activa el estado `lumen.inMode`.
4. Lumen aplica la configuración de Zen Mode.
5. Lumen abre u oculta las vistas necesarias según el modo.
6. Lumen abre el archivo activo si corresponde.
7. Lumen coloca el panel principal de Lumen a la derecha.
8. La transición desaparece cuando el workspace ya está listo.

El usuario debe pasar de la pantalla de transición a un layout final ya colocado.

## Configuración base de Zen Mode

Lumen Mode debe usar Zen Mode como base visual.

La configuración default de Zen Mode para Lumen debe ser:

```json
{
  "zenMode.centerLayout": true,
  "zenMode.fullScreen": true,
  "zenMode.hideActivityBar": true,
  "zenMode.hideLineNumbers": true,
  "zenMode.hideStatusBar": true,
  "zenMode.showTabs": "none",
  "zenMode.silentNotifications": true
}
```

Estos valores forman parte del default de Lumen Mode.

No son preferencias opcionales.

Si más adelante existe una pantalla de configuración para personalizar el workspace, esa personalización debe vivir en otro documento. Este documento define el comportamiento base.

## Elementos ocultos por default

Cuando Lumen Mode está activo, VS Code debe ocultar por default:

* Activity Bar.
* Status Bar.
* Tabs.
* Line numbers.
* Panel inferior si no está siendo usado explícitamente por Lumen.
* Barras o vistas que no formen parte del flujo activo.

El objetivo es que la pantalla quede limpia y enfocada.

Si una vista no ayuda directamente al ejercicio actual, al banco de ejercicios, al progreso o a la interacción con Lumen, no debe quedar visible en el layout default.

## Panel de Lumen

El panel principal de Lumen debe estar a la derecha.

Esta vista funciona como centro de control del modo activo.

Según el estado, el panel de Lumen puede mostrar:

* Bienvenida inicial.
* Selección de modo.
* Ruta actual.
* Banco de ejercicios.
* Filtros.
* Instrucciones del ejercicio.
* Progreso.
* Errores.
* Acciones disponibles.
* Ayuda contextual.
* Ask Tutor.
* Estados de carga o recuperación.

El panel de Lumen no debe sentirse como una vista secundaria. Debe sentirse como la interfaz principal de Lumen dentro de VS Code.

## Editor central

El editor central es la zona de trabajo principal.

En Lumen Mode, el editor debe mostrar el archivo relevante para el estado actual.

Si hay un ejercicio activo, debe abrirse el archivo `.c` correspondiente.

Si no hay ejercicio activo, el editor puede quedar limpio, mostrar un archivo inicial o esperar la selección de modo, según el flujo actual.

El editor no debe llenarse de pestañas innecesarias.

El layout default debe favorecer una experiencia limpia, con el menor ruido posible.

## Layout de Modo Ruta

Modo Ruta debe ocultar el gestor de archivos.

En este modo, el usuario no debe necesitar navegar por carpetas para avanzar.

La ruta, el ejercicio actual, las instrucciones, el progreso y las acciones principales deben estar guiadas desde la UI de Lumen.

El layout de Modo Ruta debe quedar así:

* Gestor de archivos oculto.
* Editor central visible.
* Panel de Lumen visible a la derecha.
* Activity Bar oculto.
* Status Bar oculto.
* Tabs ocultos.
* Line numbers ocultos.
* Panel inferior oculto, salvo que Lumen lo necesite explícitamente.

Modo Ruta debe sentirse como una experiencia guiada.

La estructura de archivos existe por debajo, pero no debe ser el centro de navegación del usuario.

## Layout de Modo Libre

Modo Libre debe mostrar el gestor de archivos por default.

En este modo, el usuario tiene más control sobre sus archivos, ejercicios propios, carpetas y ejercicios importados manualmente.

El layout de Modo Libre debe quedar así:

* Gestor de archivos visible a la izquierda.
* Editor central visible.
* Panel de Lumen visible a la derecha.
* Activity Bar oculto.
* Status Bar oculto.
* Tabs ocultos.
* Line numbers ocultos.
* Panel inferior oculto, salvo que Lumen lo necesite explícitamente.

`Ctrl + B` debe funcionar como toggle del gestor de archivos en Modo Libre.

Si el usuario oculta el gestor de archivos en Modo Libre, Lumen no debe forzarlo inmediatamente a reaparecer. Debe respetar esa decisión durante la sesión activa.

Al volver a entrar en Modo Libre desde cero, el default vuelve a ser gestor de archivos visible.

## Diferencia entre Modo Ruta y Modo Libre

La diferencia principal de layout es el gestor de archivos.

En Modo Ruta, el gestor de archivos está oculto porque Lumen guía la experiencia.

En Modo Libre, el gestor de archivos está visible porque el usuario puede crear, importar, organizar y modificar ejercicios propios.

El panel de Lumen siempre vive a la derecha.

El editor siempre vive en el centro.

Zen Mode siempre se activa como base.

## Vista derecha de Lumen

La vista derecha de Lumen debe ser persistente durante Lumen Mode.

No debe cerrarse accidentalmente al abrir un archivo.

No debe competir con el editor central.

No debe moverse de posición sin que el usuario lo configure explícitamente.

Si el usuario está en Modo Ruta, la vista derecha prioriza la guía de ruta y el ejercicio activo.

Si el usuario está en Modo Libre, la vista derecha prioriza el banco de ejercicios, filtros, creación/importación y estado del ejercicio actual.

## Panel inferior

El panel inferior debe estar oculto por default.

Lumen no debe depender del panel inferior como parte principal de su experiencia.

Si un flujo necesita mostrar información temporal, logs, errores o resultados, debe preferirse la UI de Lumen a la derecha o una experiencia controlada por Lumen.

El panel inferior solo debe abrirse si una acción concreta lo requiere.

Cuando esa acción termina, Lumen debe poder devolver el layout al estado default.

## Activity Bar

El Activity Bar debe estar oculto dentro de Lumen Mode.

El icono de Lumen sirve como entrada al modo, pero una vez dentro, el usuario debe trabajar desde la UI de Lumen, comandos y shortcuts.

Salir de Lumen Mode no depende del Activity Bar.

La salida rápida es `Esc`.

## Status Bar

El Status Bar debe estar oculto dentro de Lumen Mode.

La información importante de Lumen no debe depender del Status Bar.

Si Lumen necesita mostrar estado, progreso o errores, debe hacerlo en su panel derecho o mediante ayuda contextual controlada.

## Tabs

Las tabs deben estar ocultas dentro de Lumen Mode.

Lumen debe evitar que la experiencia se convierta en un workspace lleno de pestañas.

El archivo activo debe abrirse en el editor central, pero la navegación principal debe venir de Lumen.

## Line numbers

Los números de línea deben estar ocultos dentro de Lumen Mode por default.

La intención es reducir ruido visual durante la experiencia inicial de aprendizaje.

Si más adelante se decide que ciertos usuarios avanzados quieren mostrar line numbers, eso debe tratarse como configuración personalizada, no como default.

## Personalización futura

El layout default de Lumen Mode debe estar fijado.

Más adelante puede existir configuración para que el usuario personalice el workspace.

Esa personalización podría permitir mostrar line numbers, evitar full screen, mantener el status bar, cambiar la posición del panel o modificar comportamiento del gestor de archivos.

Pero esa configuración no pertenece a este documento.

Este documento define el default oficial de Lumen Mode.

## Responsabilidad del módulo

Este documento define el resultado visual final de Lumen Mode.

No define los comandos completos.

No define cómo se guarda la sesión.

No define cómo se selecciona Modo Ruta o Modo Libre.

No define la lógica interna de Ask Tutor.

No define el instalador.

No define la estructura física completa de carpetas.

Este documento solo define el layout.

## Contratos con otros módulos

`enter-lumen-mode` llama a este módulo para aplicar el layout correcto durante la secuencia de entrada.

`exit-lumen-mode` debe poder revertir o limpiar los cambios aplicados por este layout.

`lumen-mode-keybindings` define los shortcuts que permiten operar dentro del layout, como `Ctrl + B` en Modo Libre.

`session-memory` informa si el usuario debe volver a Modo Ruta, Modo Libre o último estado útil.

`route-mode` consume el layout de Modo Ruta y asume que el gestor de archivos está oculto.

`free-mode` consume el layout de Modo Libre y asume que el gestor de archivos está disponible por default.

`lumen-frontend` renderiza el contenido del panel derecho según el modo activo.

## Reglas deterministas

Modo Ruta oculta el gestor de archivos.

Modo Libre muestra el gestor de archivos por default.

Lumen siempre va a la derecha.

El editor siempre queda en el centro.

Zen Mode siempre se activa al entrar.

La transición con logo y wordmark cubre la preparación del layout.

Activity Bar queda oculto.

Status Bar queda oculto.

Tabs quedan ocultas.

Line numbers quedan ocultos.

El panel inferior queda oculto salvo necesidad explícita.

El layout default no debe depender de decisiones manuales previas del usuario.

## Resultado esperado

Al entrar a Modo Ruta, el usuario debe ver una experiencia guiada: editor central y Lumen a la derecha, sin gestor de archivos visible.

Al entrar a Modo Libre, el usuario debe ver una experiencia flexible: gestor de archivos a la izquierda, editor central y Lumen a la derecha.

En ambos casos, VS Code debe sentirse limpio, enfocado y convertido temporalmente en Lumen.
