# Local Engine

Archivo: `Architectural-plans/local-engine/local-engine.md`

## Propósito

`Local Engine` define el cerebro local de Lumen.

El Local Engine es la capa que ejecuta la lógica importante del producto en la máquina del usuario. No es la UI, no es la extensión de VS Code y no es la base de datos. Es el componente que decide, valida, prepara y ejecuta operaciones reales.

La webview muestra.

El Extension Host coordina.

El Local Engine decide y ejecuta.

La base de datos local persiste.

## Qué es el Local Engine

El Local Engine es el núcleo local de Lumen.

Debe estar pensado como una pieza independiente de VS Code. Aunque al inicio Lumen viva como extensión de VS Code, el engine no debe depender conceptualmente de VS Code para existir.

Esto es importante porque Lumen puede empezar como extensión, pero en el futuro podría tener una versión standalone. Si el engine está bien separado, la lógica principal de Lumen puede reutilizarse fuera de VS Code.

El Local Engine debe estar escrito en Rust.

La razón es que Lumen es performance-first, local-first y necesita una capa confiable para trabajar con archivos, ejercicios, compilación, análisis, progreso y estado local.

## Tech stack del módulo

Este módulo usa estas tecnologías del tech stack de Lumen:

- **Rust**: lenguaje principal del Local Engine. Se usa para construir una capa rápida, local-first, portable y confiable.
- **SQLite**: base local persistente usada por el engine para guardar estado, progreso, intentos, errores, ejercicios importados, ejercicios desbloqueados y metadata local.
- **Tree-sitter**: parser usado para analizar código C cuando Lumen necesite entender estructura de código, funciones, bloques, selección del usuario o contexto para Ask Tutor.
- **MSYS2 UCRT64 + GCC**: toolchain inicial para compilar ejercicios en C en Windows.
- **JSON estructurado / protocolo interno de requests**: formato de comunicación entre Extension Host y Local Engine. El formato exacto puede evolucionar, pero las respuestas importantes del engine no deben ser texto suelto.
- **Sistema de archivos local**: usado para crear, validar, abrir y materializar carpetas de ejercicios y archivos `.c`.

Tecnologías que no son default inicial de este módulo:

- **Limbo / Turso Database**: candidato futuro o experimental para evaluar más adelante. No reemplaza SQLite en el MVP porque el estado del usuario necesita una base estable y madura.
- **Zig**: posible alternativa futura para toolchain de compilación, pero el default inicial de Lumen para C en Windows sigue siendo MSYS2 UCRT64 + GCC.

## Qué no es el Local Engine

El Local Engine no renderiza la interfaz.

No decide el diseño visual de Lumen.

No registra botones ni keybindings de VS Code.

No modifica el layout de VS Code.

No contiene la UI de Free Mode ni la UI de Route Mode.

No debe depender de la webview para funcionar.

No debe guardar datos directamente en memoria como única fuente de verdad.

No debe asumir que siempre hay internet.

No debe asumir que siempre se está ejecutando dentro de VS Code.

## Responsabilidad principal

El Local Engine debe ser la autoridad local para las operaciones del producto.

Cuando una acción requiere tocar archivos, validar ejercicios, importar contenido, compilar, registrar intentos, leer progreso o preparar contexto para el tutor, esa acción debe pasar por el Local Engine.

La extensión no debe inventar por su cuenta el estado real del usuario.

La webview no debe decidir por su cuenta si un ejercicio está desbloqueado, importado o activo.

El Local Engine debe responder esas preguntas.

## Responsabilidades del Local Engine

El Local Engine debe encargarse de:

- Resolver el modo activo cuando sea necesario.
- Resolver el ejercicio activo.
- Resolver la ruta activa.
- Consultar la colección de ejercicios.
- Validar si un ejercicio está disponible o bloqueado.
- Importar ejercicios.
- Materializar ejercicios localmente.
- Crear ejercicios propios.
- Validar la estructura de un ejercicio.
- Preparar compilación.
- Ejecutar o coordinar ejecución.
- Parsear errores relevantes.
- Registrar intentos.
- Registrar errores.
- Actualizar progreso.
- Evaluar gates de Route Mode.
- Desbloquear ejercicios de ruta.
- Preparar contexto para Ask Tutor.
- Leer y escribir estado en la base local.
- Recuperarse de estados inconsistentes cuando sea posible.

## Relación con Extension Host

El Extension Host es la capa que vive dentro de VS Code.

Cuando el usuario presiona un botón, usa un shortcut o abre una vista, el Extension Host recibe esa acción.

Pero el Extension Host no debe hacer la lógica pesada.

Por ejemplo:

Si el usuario presiona `F9`, el Extension Host detecta el comando y le pide al Local Engine compilar el ejercicio activo.

Si el usuario entra a Free Mode, el Extension Host muestra la UI correspondiente, pero el Local Engine debe decir cuál es el ejercicio activo, qué ejercicios existen y qué se puede importar.

Si el usuario entra a Route Mode, el Extension Host prepara la vista, pero el Local Engine debe resolver la ruta activa, el módulo actual y el próximo ejercicio.

El Extension Host coordina la comunicación entre VS Code, webview y engine.

## Relación con la Webview

La webview es la UI visual de Lumen.

La webview puede mostrar botones, cards, colección de ejercicios, rutas, progreso, errores o pantallas de estado.

Pero la webview no debe ser la fuente de verdad.

Si la webview necesita saber si un ejercicio está bloqueado, debe preguntarlo.

Si necesita importar un ejercicio, debe pedirlo.

Si necesita abrir un ejercicio, debe solicitarlo.

Si necesita mostrar progreso, debe leerlo desde el estado que entrega el engine.

La webview puede tener estado temporal de UI, pero no debe guardar por sí sola el estado importante del producto.

## Relación con la base de datos local

El Local Engine debe hablar con la base de datos local.

La base local guarda estado persistente.

El engine decide cuándo leer y escribir ese estado.

La base local debe recordar cosas como:

- Último modo usado.
- Último ejercicio activo.
- Ejercicios importados.
- Ejercicios creados por el usuario.
- Ruta activa.
- Módulo actual.
- Progreso.
- Intentos.
- Errores.
- Ejercicios desbloqueados.
- Metadata cacheada de la colección.

Este documento no define tablas exactas.

La documentación de database define la estructura de datos.

La regla importante es que el Local Engine debe usar la base local como memoria persistente y no depender de estado frágil en la UI.

## Relación con Free Mode

Free Mode depende del Local Engine para operaciones reales.

Cuando el usuario busca, importa o crea ejercicios en Free Mode, el engine debe resolver la operación.

El Local Engine debe poder:

- Listar ejercicios disponibles en la colección.
- Filtrar ejercicios.
- Crear un ejercicio propio.
- Importar un ejercicio disponible.
- Detectar el ejercicio activo.
- Validar que el archivo actual pertenece a un ejercicio.
- Preparar compilación.
- Registrar intentos y errores.

Free Mode puede mostrar la experiencia flexible, pero el engine mantiene la lógica real.

## Relación con Route Mode

Route Mode depende del Local Engine para mantener la progresión.

El engine debe poder resolver:

- Ruta activa.
- Módulo actual.
- Ejercicio activo.
- Ejercicios bloqueados.
- Ejercicios desbloqueados.
- Gates de avance.
- Recomendaciones de refuerzo.
- Progreso de ruta.
- Intentos oficiales de ruta.
- Errores relevantes para progreso.

Route Mode guía al usuario, pero el Local Engine debe proteger la consistencia de la ruta.

Si un ejercicio de ruta está bloqueado, el engine debe impedir que se materialice o se resuelva desde Free Mode.

## Relación con la colección de ejercicios

La colección de ejercicios depende del Local Engine para saber qué acciones están permitidas.

La colección puede mostrar ejercicios libres y ejercicios de ruta.

El engine debe indicar si cada ejercicio está disponible, bloqueado, desbloqueado, importado o recomendado.

El engine también debe evitar que Free Mode importe o abra ejercicios de ruta bloqueados.

La colección muestra.

El engine valida.

## Relación con compilación

La compilación debe pasar por el Local Engine.

El engine debe recibir una solicitud de compilación, resolver cuál es el ejercicio activo, ubicar el archivo correcto, preparar el comando de compilación y devolver un resultado estructurado.

El resultado debe poder incluir:

- Éxito o fallo.
- Mensaje de error.
- Archivo relacionado.
- Línea o ubicación, si aplica.
- Salida del compilador.
- Datos útiles para registro de intento.
- Datos útiles para Ask Tutor.

Este documento no define la implementación profunda del compilador.

La documentación de compile-runtime define ese flujo.

La regla del Local Engine es que la compilación no debe ser una acción improvisada desde la webview.

## Relación con Ask Tutor

Ask Tutor necesita contexto.

El Local Engine debe ayudar a preparar ese contexto.

Cuando el usuario activa Ask Tutor, el engine puede reunir información como:

- Ejercicio activo.
- Enunciado.
- Código seleccionado.
- Archivo actual.
- Errores recientes.
- Intentos anteriores.
- Ruta y módulo, si aplica.
- Conceptos esperados.
- Restricciones del ejercicio.

El engine no necesariamente genera la respuesta final del tutor.

Pero sí debe ayudar a construir el contexto correcto para que el tutor no responda a ciegas.

## Relación con archivos locales

El Local Engine debe manejar archivos reales.

Lumen trabaja con archivos `.c`, carpetas de ejercicios, ejercicios importados y ejercicios creados por el usuario.

El engine debe poder validar si una carpeta representa un ejercicio válido.

Debe poder crear estructura mínima para ejercicios propios.

Debe poder materializar ejercicios importados.

Debe poder detectar si un archivo fue eliminado, movido o quedó inconsistente.

Debe evitar borrar trabajo del usuario sin confirmación.

## Local-first

El Local Engine debe asumir que Lumen tiene que funcionar localmente.

Un ejercicio ya importado debe poder abrirse y resolverse sin internet.

El progreso local no debe depender de una conexión activa.

La colección puede necesitar internet para descubrir ejercicios nuevos, pero el engine debe mantener un estado local suficiente para trabajar con lo ya importado.

La nube puede complementar.

La operación local no debe depender de la nube para lo básico.

## Proceso de comunicación

La comunicación entre Extension Host y Local Engine debe ser clara.

El Extension Host debe enviar requests al engine y recibir respuestas estructuradas.

El formato exacto puede definirse más adelante, pero la idea debe mantenerse:

```txt
request -> engine -> response
```

Las respuestas del engine no deben ser texto suelto cuando representen estado importante.

Deben ser datos estructurados que la extensión y la webview puedan entender.

Ejemplo conceptual:

```txt
compileCurrentExercise -> CompileResult
listExerciseCollection -> ExerciseCollectionState
importExercise -> ImportResult
getActiveRoute -> RouteState
getActiveExercise -> ExerciseState
```

## Errores del engine

El Local Engine debe devolver errores controlados.

No debe romper silenciosamente.

No debe hacer que la webview adivine qué pasó.

Un error del engine debe decir al menos:

- Qué operación falló.
- Si el usuario puede intentar de nuevo.
- Si falta un archivo.
- Si el estado local está inconsistente.
- Si el problema viene de compilación, importación, base local o permisos.
- Qué mensaje puede mostrar la UI.

La UI puede transformar el error en una experiencia visual más amable, pero el engine debe entregar información útil.

## Seguridad de datos del usuario

El Local Engine debe proteger el trabajo del usuario.

No debe sobrescribir archivos creados o modificados por el usuario sin una regla explícita.

No debe borrar ejercicios, intentos o progreso sin confirmación o sin una política documentada.

Si una operación de importación o actualización entra en conflicto con trabajo local, el engine debe preferir conservar el trabajo del usuario.

## Estados principales del Local Engine

El Local Engine debe poder manejar estos estados:

- Inicializando.
- Listo.
- Sin base local preparada.
- Sin workspace válido.
- Modo activo resuelto.
- Ejercicio activo resuelto.
- Importando ejercicio.
- Creando ejercicio propio.
- Compilando.
- Registrando intento.
- Recuperando estado.
- Error recuperable.
- Error crítico.

Cada estado debe poder comunicarse al Extension Host o a la webview.

## Fallos esperados

El Local Engine debe manejar fallos sin romper Lumen.

Si la base local no existe, debe poder inicializarla o pedir inicialización.

Si un ejercicio importado perdió archivos, debe reportarlo y ofrecer recuperación si es posible.

Si un archivo fue eliminado manualmente, debe limpiar o reparar el estado.

Si una ruta no existe o quedó inconsistente, debe volver a un estado seguro.

Si falla una operación de lectura o escritura, debe reportar error controlado.

Si no hay internet, debe permitir trabajar con contenido local.

## Reglas deterministas

El Local Engine es la fuente de verdad local.

La webview no decide estado importante.

El Extension Host no ejecuta lógica pesada de producto.

La base local persiste estado.

El engine valida disponibilidad, bloqueos, imports y ejercicios activos.

El engine protege bloqueos de Route Mode.

El engine permite Free Mode sin romper Route Mode.

El engine prepara compilación.

El engine registra intentos y errores.

El engine prepara contexto para Ask Tutor.

El engine debe funcionar con lógica local-first.

## Resultado esperado

El Local Engine permite que Lumen no sea solo una UI dentro de VS Code.

Permite que Lumen tenga memoria, reglas, progreso, compilación, ejercicios reales, bloqueos, imports y recuperación de estado.

El usuario ve una experiencia simple.

Lumen internamente mantiene una arquitectura clara:

La UI muestra.

La extensión coordina.

El engine decide y ejecuta.

La base local recuerda.
