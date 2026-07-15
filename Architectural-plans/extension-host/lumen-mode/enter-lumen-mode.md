# Enter Lumen Mode

## Propósito

`Enter Lumen Mode` define qué ocurre cuando el usuario presiona el icono de Lumen dentro de VS Code.

## Estado actual del repo

La entrada a Lumen Mode ya aplica el layout enfocado default; el contenido
sigue siendo el mock de Route Path View.

Hoy `lumen.open` y `lumen.enterMode` llaman a `extension/src/lumenEntry.ts`.
Esa secuencia:

- Calcula `LumenEntryState` con protocolo `3`, modo `route`, phase
  `mock-route-path-view` y estado del workspace `.lumen`.
- Guarda un `bootIntent` en `context.globalState` solo si debe cambiar al
  workspace oficial y retomar la entrada tras el reload.
- Activa context keys `lumen.inMode = true` y `lumen.mode = route`.
- Precarga el HTML compilado desde que se activa la extensión. Al recibir el
  gesto, cierra el launcher y no necesita esperar una lectura de disco antes de
  crear el panel de Lumen.
- Aplica el layout enfocado (`extension/src/lumenLayout.ts`): snapshot de los
  settings a nivel workspace, escribe los defaults de Lumen Mode
  (`zenMode.*` con `centerLayout: false`).
- Crea `lumen.routePathPanel` A PANTALLA COMPLETA y activa Zen Mode en el mismo
  turno visual, de modo que la primera superficie propia que se pinta es la
  cortina fullscreen.
  La cortina de entrada (logo + wordmark + barra + porcentaje) vive DENTRO del
  HTML del panel como intro estático, así que no existe un panel de cortina
  separado y —crítico— ninguna mutación de layout ocurre mientras el webview
  carga sus módulos. (Un cambio de layout de editor a mitad del boot corrompía
  la carga del bundle: el chunk llegaba roto con un SyntaxError de
  identificador duplicado y la cortina quedaba congelada.)
- El frontend bootea detrás de su propia cortina; la app Svelte retoma el
  porcentaje del intro estático (`window.__LUMEN_STATIC_INTRO__`) y lo lleva a
  100 con sus señales reales de listo. Un watchdog en el panel reintenta el
  HTML una vez si `frontend.ready` no llega en 5s.
- Después de `frontend.ready`, el host envía `lumen.layoutCommitRequested` y
  espera `frontend.layoutCommitArmed` mientras la carga continúa. El frontend
  instala los observadores, pero todavía no permite retirar la cortina.
- Al llegar a 100, la barra y el porcentaje salen mientras el isotipo hace un
  punch-in rápido todavía A PANTALLA COMPLETA. En ese mismo turno el frontend
  recaptura la geometría, habilita el commit y emite
  `frontend.layoutHandoffReady` con `delayMs: 60`. El reloj se cumple en el
  Extension Host, fuera del iframe, para que el throttling de Chromium no pueda
  alargarlo a ~1 s. Así el layout ocurre durante la máxima velocidad del zoom.
- Solo entonces el panel se mueve al grupo derecho (~1/3). En el primer resize
  real, el frontend retira la cortina sin fade y antes del paint; por ello el
  fondo de carga no puede sobrevivir dentro del panel derecho.
- `lumen.layoutCommitted` confirma que los comandos del host terminaron, pero no
  revela por sí solo. `frontend.revealed` confirma el commit geométrico y permite
  marcar la sesión como activa. Si falta cualquier señal o resize, la entrada
  falla cerrada y restaura el workspace.
- Envía `lumen.entry.state` a la webview al crear la entrada y después de cada
  `frontend.ready`.

La vista contribuida `lumen.routePath` del Activity Bar sigue existiendo, pero
ahora es solo un launcher liviano: cuando VS Code la hace visible por el click
del usuario, la extensión cierra el sidebar y ejecuta `lumen.enterMode`. Esa
vista no carga el frontend.

`Esc` sale del modo por dos vías equivalentes: keybinding contribuido con
`when: lumen.inMode` (foco fuera de la webview) y mensaje de protocolo
`lumen.exit.requested` emitido por el frontend (foco dentro de la webview).

No implementa todavía selección de modo, bienvenida de primera entrada,
apertura de archivo activo del ejercicio, restauración del último estado útil
ni cambio automático al workspace `.lumen`.

La pantalla de entrada visual pertenece al App Shell de la webview y está
documentada en `Architectural-plans/frontend/app-shell/app-shell.md`.

Esta feature no documenta el instalador, la estructura completa de carpetas, el funcionamiento interno de Modo Ruta, el funcionamiento interno de Modo Libre ni la lógica profunda de cada comando.

Su responsabilidad es definir, de forma explícita, cómo se entra a Lumen Mode, qué configuración visual se aplica, qué vistas aparecen, qué vistas se ocultan, qué comandos quedan disponibles y cómo se prepara la experiencia inicial del usuario.

Entrar a Lumen Mode no significa abrir un panel más. Significa transformar temporalmente VS Code en un entorno enfocado de Lumen.

## Punto de entrada

Lumen debe aparecer en el Activity Bar de VS Code con su icono oficial.

El icono debe usar el logo SVG de Lumen y funcionar como la entrada principal del producto dentro de VS Code.

Al presionar el icono de Lumen, VS Code abre la vista contribuida
`lumen.routePath`; esa vista funciona como stub launcher y ejecuta el comando:

```txt
lumen.enterMode
```

Si Lumen Mode no está activo, este comando inicia la secuencia de entrada.

Si Lumen Mode ya está activo, este comando no debe duplicar vistas ni crear una nueva instancia. Debe enfocar la experiencia existente de Lumen.

## Secuencia de entrada

Al ejecutar `lumen.enterMode`, Lumen debe seguir esta secuencia:

1. Activar el estado interno `lumen.inMode`.
2. Mostrar una pantalla de transición con el logo de Lumen y el wordmark.
3. Aplicar en background la configuración visual de Lumen Mode.
4. Resolver si el usuario entra a primera apertura, Modo Ruta, Modo Libre o último estado útil.
5. Abrir las vistas necesarias según el modo.
6. Abrir el archivo activo si existe.
7. Activar los keybindings contextuales de Lumen.
8. Mostrar la UI principal de Lumen en su posición correspondiente.
9. Ocultar la pantalla de transición cuando el layout esté listo.

La transición con logo y wordmark no es decorativa solamente. Sirve para cubrir visualmente el momento en que VS Code aplica el layout, cambia vistas, activa Zen Mode y prepara el contexto de trabajo.

El usuario no debe ver la interfaz “armándose” de forma desordenada. Debe ver Lumen cargando y luego entrar en un workspace ya colocado.

## Primera entrada

Si es la primera vez que el usuario entra a Lumen Mode, la transición inicial debe llevar a una bienvenida visual.

La bienvenida debe mostrar primero el logo de Lumen y el wordmark. Después debe presentar una explicación breve de qué es Lumen, cuáles son sus modos principales y cuáles son los comandos mínimos para empezar.

La bienvenida debe explicar que existen dos modos:

Modo Ruta.

Modo Libre.

También debe mencionar los comandos principales de Lumen Mode, pero sin explicar profundamente cada uno. La explicación profunda de comandos vive en documentos separados.

Después de la bienvenida, Lumen debe llevar al usuario a la selección de modo.

## Entrada normal

Si el usuario ya completó la primera entrada, `lumen.enterMode` debe llevarlo al último estado útil.

Si existe un ejercicio pendiente, se abre ese ejercicio.

Si el último estado útil fue Modo Ruta, se entra a Modo Ruta.

Si el último estado útil fue Modo Libre, se entra a Modo Libre.

Si no hay estado útil, se abre la selección de modo.

## Configuración base de Zen Mode

Lumen Mode debe activar Zen Mode como base visual.

La configuración default de Lumen Mode debe fijar estos valores:

```json
{
  "zenMode.centerLayout": false,
  "zenMode.fullScreen": true,
  "zenMode.hideActivityBar": true,
  "zenMode.hideLineNumbers": true,
  "zenMode.hideStatusBar": true,
  "zenMode.showTabs": "none",
  "zenMode.silentNotifications": true
}
```

`zenMode.centerLayout` queda en `false`: el editor no debe tener márgenes
centrados dentro de Lumen Mode.

`zenMode.restore` no debe usarse como mecanismo principal de Lumen Mode. Lumen debe controlar su propio estado de entrada y salida mediante `lumen.enterMode` y `lumen.exitMode`.

Lumen Mode debe aplicar estos valores como configuración de modo, no como una modificación permanente e invisible para el usuario.

Si en el futuro el usuario puede personalizar el workspace, esa personalización debe vivir en un documento separado. El default de Lumen Mode sigue siendo este.

## Layout default

El layout default de Lumen Mode es determinista.

No es una sugerencia visual.

No depende del azar, del último layout manual del usuario ni de cómo estaba VS Code antes de entrar.

Al terminar la secuencia de entrada, VS Code debe quedar en una de dos variantes de layout:

Modo Ruta.

Modo Libre.

Ambos modos comparten la base de Zen Mode, pero no muestran exactamente las mismas zonas.

## Layout de Modo Ruta

En Modo Ruta, el gestor de archivos debe estar oculto.

El usuario no debe depender del File Explorer para avanzar por la ruta.

La UI principal de Lumen debe guiar el flujo: ruta actual, ejercicio activo, instrucciones, progreso, estado, acciones disponibles y navegación.

El editor central debe mostrar el archivo de trabajo correspondiente al ejercicio activo.

El panel de Lumen debe estar visible y ser la guía principal del usuario.

El Activity Bar, Status Bar, tabs, line numbers y barras no necesarias deben quedar ocultos según la configuración default de Lumen Mode.

Modo Ruta debe sentirse como una experiencia guiada. La estructura de archivos puede existir por debajo, pero no debe ser el mecanismo principal de navegación del usuario.

## Layout de Modo Libre

En Modo Libre, el gestor de archivos puede estar visible.

El modo libre es el espacio donde el usuario puede crear ejercicios propios, importar ejercicios específicos, trabajar tareas externas o practicar temas concretos sin seguir una ruta guiada.

Por eso, en Modo Libre, el File Explorer sí tiene valor para el usuario.

El layout default de Modo Libre debe organizarse así:

A la izquierda, el gestor de archivos.

En el centro, el editor de código.

A la derecha, el panel principal de Lumen.

El panel de Lumen debe mostrar el banco de ejercicios, filtros, acciones de importación, creación de ejercicios propios o información del ejercicio actual.

`Ctrl + B` debe quedar disponible como comando para mostrar u ocultar el gestor de archivos en Modo Libre.

En Modo Ruta, el gestor de archivos debe permanecer oculto por default.

## Vistas que genera Lumen

Al entrar a Lumen Mode, la extensión debe preparar las vistas propias de Lumen.

Lumen debe tener una vista principal en el Activity Bar usando el icono oficial.

Esa vista del Activity Bar no debe renderizar la UI principal. Sirve solo como
entrada al modo para conservar el gesto de usuario esperado.

La UI principal de Lumen debe mostrarse como `WebviewPanel` de editor a la
derecha del editor del usuario.

El panel principal de Lumen debe ser capaz de renderizar diferentes estados:

* Transición de entrada.
* Bienvenida inicial.
* Selección de modo.
* Vista de Modo Ruta.
* Vista de Modo Libre.
* Banco de ejercicios.
* Estado del ejercicio actual.
* Ayuda contextual.
* Estados de error o recuperación.

La vista de Lumen no debe ser un panel secundario decorativo. Debe funcionar como el centro de control de la experiencia.

## Comandos activos al entrar

Al entrar en Lumen Mode, deben quedar disponibles los comandos contextuales de Lumen.

Este documento no explica en profundidad el comportamiento interno de cada comando. Solo define que estos comandos deben quedar activos y disponibles dentro de Lumen Mode.

Comandos base:

```txt
Esc              -> lumen.exitMode
F9               -> lumen.compileCurrentExercise
Ctrl + Shift + R -> lumen.askTutor
Ctrl + B         -> workbench.action.toggleSidebarVisibility
Ctrl + Shift + P -> Command Palette de VS Code
```

Cada acción importante de Lumen debe tener botón visual y comando equivalente.

Los botones ayudan a descubrir la acción.

Los comandos ayudan a que el usuario aprenda un flujo más cercano al de un programador.

Los keybindings de Lumen deben activarse por contexto. Deben depender de un estado equivalente a:

```txt
lumen.inMode == true
```

Los comandos no deben invadir el comportamiento global de VS Code cuando Lumen Mode no está activo.

## Escape como salida

`Esc` debe ser la salida rápida de Lumen Mode.

Cuando el usuario presiona `Esc` y no hay ningún estado temporal abierto, Lumen debe ejecutar:

```txt
lumen.exitMode
```

Si hay un prompt, mini ventana, selector, input o interacción temporal abierta, `Esc` debe cerrar primero esa interacción.

Solo cuando no haya interacción temporal activa, `Esc` debe salir de Lumen Mode.

La lógica profunda de salida vive en el documento `exit-lumen-mode.md`.

## Ayuda contextual

Lumen Mode debe mostrar una ayuda contextual ligera para recordar comandos.

Esta ayuda puede aparecer como hover, tooltip, mini card o zona compacta dentro del panel de Lumen.

Debe ser contextual al estado actual.

En Modo Ruta debe recordar los comandos útiles para resolver, compilar, pedir ayuda y salir.

En Modo Libre debe recordar también el uso de `Ctrl + B` para mostrar u ocultar el gestor de archivos.

La ayuda contextual no debe explicar profundamente cada comando. Solo debe funcionar como memoria rápida.

## Ask Tutor dentro de Lumen Mode

`Ctrl + Shift + R` debe estar disponible dentro de Lumen Mode como entrada rápida a Ask Tutor.

Si el usuario tiene una línea, función, bloque o fragmento seleccionado, ese fragmento debe usarse como contexto inicial.

Si no hay selección, Ask Tutor debe usar el contexto general del ejercicio actual.

La respuesta del tutor debe seguir la filosofía socrática de Lumen.

La explicación completa de Ask Tutor vive en su propio módulo. Aquí solo se define que Enter Lumen Mode debe activar el comando y conectarlo al contexto actual.

## Selección de modo

Cuando Lumen necesita que el usuario elija cómo trabajar, debe mostrar una selección clara entre Modo Ruta y Modo Libre.

Modo Ruta significa seguir una experiencia guiada.

Modo Libre significa trabajar sin ruta obligatoria: buscar ejercicios, importar ejercicios, crear ejercicios propios y practicar temas concretos.

La selección de modo no debe tratarse como configuración técnica. Debe presentarse como una decisión de uso.

## Contratos con otros módulos

`Enter Lumen Mode` coordina otros módulos, pero no absorbe sus responsabilidades.

`lumen-mode-layout` define con precisión cómo se aplican las vistas, qué comandos de VS Code se ejecutan para ocultar o mostrar zonas, y cómo se restauran luego.

`lumen-mode-keybindings` define la implementación exacta de los shortcuts, sus `when clauses`, conflictos y prioridades.

`lumen-mode-help` define el diseño y contenido exacto del hover, tooltip, mini card o ayuda contextual.

`session-memory` responde si el usuario ya completó la bienvenida, cuál fue el último modo usado y si existe un ejercicio pendiente.

`mode-selection` define la pantalla y comportamiento de selección entre Modo Ruta y Modo Libre.

`route-mode` define el comportamiento profundo del modo guiado.

`free-mode` define el comportamiento profundo del modo libre.

`exercise-workspace` abre o prepara los archivos de trabajo necesarios.

`lumen-frontend` renderiza la transición, bienvenida, panel derecho y vistas internas.

`local-engine` resuelve el estado real de ejercicios, progreso, errores, intentos y metadata local.

`ask-tutor` implementa la experiencia completa de ayuda socrática.

## Reglas deterministas

Lumen Mode tiene un default explícito.

El default no debe quedar abierto a interpretación.

Modo Ruta oculta el gestor de archivos.

Modo Libre permite ver el gestor de archivos.

El panel de Lumen va a la derecha.

El editor queda como zona central.

Zen Mode se activa con la configuración definida en este documento.

La pantalla de transición se muestra mientras el layout se prepara.

Los comandos se activan por contexto.

Los botones importantes tienen comando equivalente.

La salida rápida es `Esc`.

El usuario puede personalizar más adelante, pero la personalización no cambia el default documentado aquí.

## Resultado esperado

Al terminar `lumen.enterMode`, el usuario debe ver Lumen listo para trabajar.

Si entra a Modo Ruta, debe ver el editor y la guía de Lumen, sin gestor de archivos visible.

Si entra a Modo Libre, debe ver el gestor de archivos a la izquierda, el editor en el centro y Lumen a la derecha.

En ambos casos, la experiencia debe estar en Zen Mode, con distracciones ocultas, comandos activos, ayuda contextual disponible y salida clara mediante `Esc`.
