# Extension Engine Bridge

Archivo: `Architectural-plans/extension-engine-bridge/extension-engine-bridge.md`

## Propósito

`Extension Engine Bridge` define cómo se comunican la extensión de VS Code y el Local Engine de Lumen.

Este módulo existe porque Lumen no debe meter toda la lógica dentro del Extension Host ni dentro de la webview.

La extensión recibe acciones desde VS Code.

La webview muestra la interfaz.

El Local Engine decide y ejecuta la lógica importante.

El bridge conecta esas piezas.

## Qué es el bridge

El bridge es la capa de comunicación entre el mundo de VS Code y el Local Engine.

Cuando el usuario presiona un botón, usa un comando o interactúa con la UI de Lumen, esa acción tiene que llegar al engine si requiere lógica real.

El bridge se encarga de convertir acciones de la extensión en requests para el engine, y respuestas del engine en eventos o estados que la UI pueda mostrar.

El bridge no es una UI.

No es la base de datos.

No es el sistema de compilación.

No es Free Mode ni Route Mode.

Es el contrato de comunicación.

## Por qué hace falta

Lumen tiene varias capas:

La webview muestra la experiencia visual.

El Extension Host registra comandos, keybindings, views y acciones dentro de VS Code.

El Local Engine trabaja con archivos, ejercicios, progreso, compilación, colección de ejercicios, bloqueos y base local.

Sin un bridge claro, cada capa podría empezar a inventar su propia lógica.

Eso rompería la arquitectura.

El bridge existe para que una acción tenga un camino claro:

```txt
UI / VS Code command -> Extension Host -> Bridge -> Local Engine -> Bridge -> Extension Host -> UI
```

## Tech stack del módulo

Este módulo usa estas tecnologías del tech stack de Lumen:

- **TypeScript**: vive en la extensión de VS Code y coordina la comunicación con el engine.
- **Node.js child_process**: mecanismo inicial para lanzar o hablar con el binario local del engine desde el Extension Host.
- **Rust binary**: ejecutable local del Local Engine.
- **JSON estructurado**: formato base para requests, responses y errores entre extensión y engine.
- **Webview message passing**: comunicación entre la UI de Lumen y el Extension Host.
- **VS Code Extension API**: capa que recibe comandos, lee contexto del editor, abre vistas y actualiza la UI.
- **Filesystem local**: usado para resolver rutas del engine, workspace, ejercicios y archivos activos.

Tecnologías candidatas o futuras:

- **JSON-RPC**: posible evolución si el protocolo crece mucho y se necesita una convención más formal.
- **Proceso persistente del engine**: posible evolución si lanzar el engine por operación se vuelve lento.
- **IPC más específico**: posible evolución si Lumen necesita streaming, eventos en vivo o tareas largas más complejas.

## Regla de autoridad

El bridge no decide reglas de producto.

El bridge transporta requests y responses.

La autoridad debe quedar así:

```txt
Webview: muestra UI y emite acciones del usuario.
Extension Host: coordina VS Code y llama al bridge.
Bridge: traduce y transporta.
Local Engine: decide y ejecuta.
Local Database: persiste.
```

Si la webview pregunta si un ejercicio está bloqueado, el bridge debe llevar esa pregunta al engine.

Si el usuario pide importar un ejercicio, el bridge debe llevar esa solicitud al engine.

Si el usuario presiona `F9`, el bridge debe pedir al engine compilar el ejercicio actual.

El bridge no debe responder esas cosas por su cuenta.

## Comunicación Webview -> Extension Host

La webview no debe hablar directamente con el Local Engine.

La webview debe enviar mensajes al Extension Host.

Ejemplos de mensajes desde la webview:

```txt
freeMode.openCollection
exercise.import
exercise.open
exercise.createCustom
route.continue
route.select
askTutor.open
compile.current
```

El Extension Host recibe esos mensajes, valida el contexto mínimo y decide si debe llamar al bridge.

La webview puede manejar estado visual temporal, pero no debe guardar ni decidir estado persistente importante.

## Comunicación Extension Host -> Local Engine

El Extension Host debe comunicarse con el Local Engine mediante un protocolo estructurado.

La forma inicial puede ser lanzar un binario Rust y comunicarse mediante stdin/stdout con JSON.

También puede existir una estrategia de proceso persistente si hace falta por performance.

La decisión inicial debe priorizar simplicidad, estabilidad y debugging.

La comunicación debe ser suficientemente clara para que Codex, otro programador o el propio Axel puedan entender qué request se manda y qué response se espera.

## Formato de request

Cada request al engine debe tener una forma estructurada.

Conceptualmente:

```json
{
  "id": "request-id",
  "method": "compileCurrentExercise",
  "params": {
    "workspacePath": "...",
    "activeFile": "..."
  }
}
```

`id` permite relacionar request y response.

`method` indica la operación.

`params` contiene datos necesarios.

El formato exacto puede evolucionar, pero la regla es que no se deben mandar strings ambiguos para operaciones importantes.

## Formato de response

Cada response del engine debe tener una forma estructurada.

Conceptualmente:

```json
{
  "id": "request-id",
  "ok": true,
  "result": {
    "status": "compiled",
    "outputPath": "..."
  }
}
```

Si falla:

```json
{
  "id": "request-id",
  "ok": false,
  "error": {
    "code": "COMPILE_FAILED",
    "message": "La compilación falló.",
    "recoverable": true
  }
}
```

La UI puede convertir esos datos en una experiencia visual más bonita, pero el bridge debe recibir datos claros.

## Errores

Los errores no deben viajar como texto suelto.

Un error debe tener como mínimo:

- Código de error.
- Mensaje corto.
- Si es recuperable.
- Operación que falló.
- Datos útiles para la UI.
- Datos técnicos si hacen falta para debugging.

Ejemplos de códigos:

```txt
ENGINE_NOT_FOUND
ENGINE_START_FAILED
INVALID_WORKSPACE
EXERCISE_NOT_FOUND
EXERCISE_LOCKED
IMPORT_FAILED
COMPILE_FAILED
DATABASE_ERROR
PERMISSION_DENIED
UNKNOWN_ERROR
```

La UI no debe tener que adivinar qué pasó leyendo stdout sin estructura.

## Operaciones iniciales del bridge

El bridge debe soportar operaciones base como:

```txt
engine.healthCheck
session.getLastState
mode.resolveInitialState
collection.list
collection.filter
exercise.import
exercise.open
exercise.createCustom
exercise.getActive
route.getActive
route.continue
route.unlockState
compile.currentExercise
attempt.register
error.register
askTutor.prepareContext
```

No todas tienen que implementarse el primer día.

Pero el bridge debe estar diseñado para crecer sin convertirse en una lista caótica de comandos improvisados.

## Health check

El bridge debe poder verificar si el Local Engine está disponible.

Antes de usar operaciones críticas, la extensión debe poder hacer:

```txt
engine.healthCheck
```

Esto permite saber si el binario existe, si responde y si su versión es compatible.

Si el engine no está disponible, Lumen debe mostrar un error claro en vez de fallar silenciosamente.

## Versionado

El bridge debe tener versión de protocolo.

La extensión y el engine deben poder saber si son compatibles.

Ejemplo conceptual:

```txt
protocolVersion: 1
engineVersion: 0.1.0
```

Si la extensión espera una versión y el engine responde otra incompatible, Lumen debe mostrar un error controlado.

Esto es importante porque el instalador o actualizador puede cambiar una pieza sin cambiar la otra.

## Proceso del engine

La decisión inicial puede ser lanzar el engine bajo demanda.

Eso significa que la extensión ejecuta el binario cuando necesita una operación y espera su respuesta.

Para operaciones simples puede ser suficiente.

Si Lumen necesita muchas operaciones rápidas, streaming de logs, estado vivo o tasks largas, puede evolucionar a un proceso persistente.

La regla actual es:

```txt
MVP: bridge simple y debuggable.
Futuro: proceso persistente si la performance lo exige.
```

## Operaciones largas

Algunas operaciones pueden tardar:

- Importar ejercicio.
- Compilar.
- Actualizar colección.
- Reparar estado.
- Preparar contexto grande para Ask Tutor.

El bridge debe poder reportar progreso o al menos estados intermedios cuando haga falta.

No todo debe bloquear la UI.

Si una operación tarda, el usuario debe ver estado de carga o progreso en Lumen.

## Cancelación

El bridge debe contemplar cancelación para operaciones largas.

Si el usuario sale de Lumen Mode, cierra VS Code o cancela una acción, la extensión debe poder pedir al engine que cancele o limpiar el proceso de forma segura.

La cancelación profunda pertenece a cada módulo, pero el bridge debe permitir transportarla.

Ejemplo conceptual:

```txt
operation.cancel
```

## Relación con Free Mode

Free Mode usa el bridge para operaciones como:

- Listar colección de ejercicios.
- Filtrar ejercicios.
- Importar ejercicio.
- Crear ejercicio propio.
- Detectar ejercicio activo.
- Compilar.
- Preparar contexto de Ask Tutor.
- Registrar errores e intentos.

Free Mode no debe llamar directamente a la base local.

Free Mode no debe modificar archivos directamente desde la webview.

Debe pasar por el bridge y el Local Engine.

## Relación con Route Mode

Route Mode usa el bridge para operaciones como:

- Resolver ruta activa.
- Continuar ruta.
- Abrir ejercicio activo.
- Consultar gates.
- Consultar ejercicios desbloqueados.
- Registrar progreso.
- Recomendar refuerzo.
- Compilar.
- Preparar contexto de Ask Tutor.

Route Mode no debe decidir desbloqueos solo desde la UI.

El bridge debe llevar esas decisiones al Local Engine.

## Relación con Exercise Collection

La colección de ejercicios usa el bridge para consultar qué ejercicios existen y qué estados tienen.

La colección no debe decidir por sí sola si un ejercicio está bloqueado o desbloqueado.

Debe pedir al engine el estado real.

Cuando el usuario intenta importar un ejercicio bloqueado, el engine debe rechazar la operación y devolver un error estructurado como `EXERCISE_LOCKED`.

## Relación con Compile Runtime

Compile Runtime depende del bridge porque `F9` nace como comando de VS Code.

El Extension Host detecta `F9`.

El bridge solicita al engine compilar el ejercicio actual.

El engine devuelve el resultado.

La UI muestra éxito, error o salida relevante.

La compilación no debe ser una acción improvisada directamente en la webview.

## Relación con Ask Tutor

Ask Tutor depende del bridge para preparar contexto.

La webview puede abrir la experiencia visual de Ask Tutor.

Pero el contexto real debe venir del engine cuando haga falta.

El bridge debe poder pedir:

```txt
askTutor.prepareContext
```

Ese contexto puede incluir ejercicio activo, selección de código, errores recientes, ruta actual, módulo actual e intentos.

## Seguridad

El bridge debe proteger al usuario.

No debe ejecutar comandos arbitrarios recibidos desde la webview.

No debe permitir que la UI mande rutas peligrosas sin validación.

No debe ejecutar métodos no registrados.

No debe confiar ciegamente en parámetros que vienen de la webview.

El Extension Host y el Local Engine deben validar.

La webview es una UI, no una fuente confiable de autoridad.

## Logs

El bridge debe permitir debugging.

Debe registrar información suficiente para entender fallos de comunicación, sin guardar datos sensibles innecesarios.

Puede registrar:

- Método llamado.
- Duración.
- Resultado general.
- Código de error.
- Versión del engine.
- Fallos de parseo.

No debe registrar código del usuario completo salvo que exista una razón clara y una política definida.

## Fallos esperados

El bridge debe manejar fallos como:

- Engine no encontrado.
- Engine no ejecutable.
- Engine responde JSON inválido.
- Timeout.
- Permisos insuficientes.
- Versión incompatible.
- Operación cancelada.
- Error interno del engine.
- Webview cerrada antes de recibir respuesta.
- VS Code cerrándose durante una operación.

En todos los casos, Lumen debe intentar fallar de forma controlada.

## Reglas deterministas

La webview no habla directamente con el engine.

El Extension Host es el punto de coordinación.

El bridge comunica Extension Host y Local Engine.

Las requests son estructuradas.

Las responses son estructuradas.

Los errores tienen código.

El bridge no decide reglas de producto.

El Local Engine es la autoridad de lógica local.

El bridge debe soportar health check.

El bridge debe tener versión de protocolo.

El bridge debe evitar comandos arbitrarios desde la UI.

## Resultado esperado

El bridge permite que Lumen tenga una arquitectura clara.

La UI puede pedir acciones sin saber cómo se ejecutan internamente.

El Extension Host puede coordinar VS Code sin cargar lógica pesada.

El Local Engine puede ejecutar operaciones reales y devolver resultados claros.

Lumen evita mezclar UI, comandos de VS Code, archivos, base local y lógica de producto en un solo lugar.
