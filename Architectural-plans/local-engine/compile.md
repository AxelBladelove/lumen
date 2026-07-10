# Compile

Archivo: `Architectural-plans/local-engine/compile.md`

## Propósito

`Compile` define el comportamiento de compilación y ejecución de ejercicios en Lumen.

## Estado actual del repo

El flujo base de `F9` está implementado como slice transicional (protocolo v2,
ver `Architectural-plans/extension-engine-bridge/protocol-v2.md`):

- El Local Engine implementa `exercise.compile` (GCC con `-Wall -Wextra -g`,
  artefactos en `.lumen-build/`, diagnósticos estructurados, timeout de 30s,
  registro en `compile_attempts`) y `toolchain.check` (`engine/src/compile.rs`).
- La extensión contribuye `lumen.compileCurrentExercise` con keybinding `F9`,
  terminal integrada "Lumen Compile" (errores en rojo, warnings en azul) y
  consola externa en Windows al compilar con éxito
  (`extension/src/lumenCompile.ts`).

Lo que aún NO existe de este documento: resolución del ejercicio activo por el
engine (hoy la extensión pasa el archivo del editor activo), validación de
ejercicios bloqueados y clasificación de intentos por ruta (no hay Exercise
Collection ni modos todavía). El resto de este documento describe el
comportamiento objetivo completo.

Este archivo vive dentro de `local-engine` porque compilar no debe ser una responsabilidad de la webview ni del Extension Host. La UI puede tener un botón y VS Code puede recibir el shortcut `F9`, pero la lógica real de compilación debe pasar por el Local Engine.

La promesa principal es simple:

El usuario escribe código, presiona `F9` y Lumen compila lo más rápido posible.

Si compila correctamente, Lumen abre una ventana externa de consola donde corre el programa.

Si hay errores de compilación, Lumen no abre la ventana externa y muestra los errores en la terminal integrada de VS Code, de forma clara.

## Qué es F9 en Lumen

`F9` es el comando principal para compilar y ejecutar el ejercicio actual.

El comportamiento esperado está inspirado en la experiencia de Code::Blocks: el usuario presiona una tecla, el IDE compila, y si todo está correcto abre una consola externa donde el programa se ejecuta.

Lumen no debe copiar internamente Code::Blocks ni depender de su código. La implementación debe escribirse desde cero y adaptarse a la arquitectura de Lumen.

Lo que se busca imitar es la experiencia:

```txt
Presionar F9.
Compilar rápido.
Si no hay errores, abrir consola externa.
Si hay errores, mostrar errores claros.
```

## Objetivo de performance

Compile debe ser performance-first.

La experiencia ideal es que pasen milisegundos entre presionar `F9` y ver la respuesta inicial de Lumen.

Si el programa compila correctamente, la ventana externa debe aparecer lo más rápido posible.

Si hay errores, la terminal integrada debe aparecer rápidamente con los errores filtrados y presentados de forma clara.

La compilación no debe sentirse pesada, lenta ni como si Lumen estuviera ejecutando una cadena de comandos improvisada.

## Tech stack del módulo

Este módulo usa estas tecnologías del tech stack de Lumen:

- **Rust**: implementación principal dentro del Local Engine.
- **MSYS2 UCRT64**: entorno inicial para toolchain C en Windows.
- **GCC**: compilador inicial para ejercicios de C.
- **Windows process spawning**: apertura de la ventana externa donde corre el programa compilado.
- **VS Code Integrated Terminal**: salida controlada para errores y warnings de compilación.
- **SQLite**: registro de intentos, errores de compilación y resultados relevantes.
- **JSON estructurado**: respuesta del Local Engine hacia el Extension Host.
- **Filesystem local**: lectura de archivos `.c`, generación de ejecutables y manejo de carpetas temporales/build.
- **Compatibilidad con librerías antiguas de consola**: el runtime debe conservar integración con librerías usadas en cursos introductorios, especialmente `conio.h` cuando el entorno/toolchain lo permita.

## Flujo principal

El flujo base de `F9` debe ser:

```txt
Usuario presiona F9.
Extension Host recibe `lumen.compileCurrentExercise`.
Extension Host pide al Local Engine compilar.
Local Engine resuelve el ejercicio activo.
Compile valida archivo, carpeta y toolchain.
Compile ejecuta GCC.
Si hay errores, muestra terminal integrada con errores.
Si compila correctamente, abre ventana externa y ejecuta el programa.
Compile registra intento y resultado.
```

El usuario no debe tener que abrir una terminal manualmente ni escribir comandos de GCC para ejercicios normales de Lumen.

## Ventana externa de ejecución

Si la compilación termina correctamente, Lumen debe abrir una ventana externa de consola para ejecutar el programa.

Esta ventana debe comportarse como una consola normal de programa en C.

Debe permitir input del usuario.

Debe mostrar output del programa.

Debe permanecer visible el tiempo suficiente para que el usuario vea el resultado.

Debe integrarse bien con ejercicios de consola y librerías antiguas usadas en clases introductorias, como `conio.h`, cuando el toolchain lo permita.

La ventana externa no debe abrirse si la compilación falla.

## Errores de compilación

Si la compilación falla, Lumen no debe abrir la ventana externa.

En ese caso debe mostrar los errores en la terminal integrada de VS Code.

La terminal integrada debe abrirse en la zona inferior aunque Lumen esté en Zen Mode.

Debe mostrarse solamente la terminal necesaria para los errores de compilación. Lumen no debe abrir ni enfocar Problems, Output, Debug Console, Ports u otros paneles que distraigan.

El usuario debe sentir que Lumen abrió un área de errores limpia, no todo el panel de herramientas de VS Code.

## Presentación de errores

Los errores deben mostrarse de forma clara.

La salida de GCC puede ser difícil de leer para principiantes. Lumen no tiene que corregir mágicamente todos los mensajes del compilador, pero sí debe limpiar y presentar la información lo mejor posible.

La terminal integrada debe intentar mostrar:

- Archivo.
- Línea.
- Tipo de mensaje.
- Error o warning.
- Mensaje principal.
- Fragmento relevante cuando sea posible.

Los errores deben resaltarse en rojo.

Los warnings deben resaltarse en azul.

No debe llenarse la terminal con texto innecesario.

Debe evitarse mostrar ruido técnico que no ayude al usuario a corregir su programa.

## Comportamiento tipo Code::Blocks

El comportamiento de Compile debe sentirse cercano a Code::Blocks para estudiantes que vienen de ese flujo.

Eso significa:

Si hay errores, el usuario ve errores de compilación.

Si no hay errores, se abre una consola externa.

La ejecución del programa ocurre en una ventana separada, no escondida dentro de la UI de Lumen.

La compilación debe sentirse directa, rápida y predecible.

Lumen puede tener una arquitectura interna más moderna que Code::Blocks, pero la experiencia del usuario debe conservar esa simplicidad.

## Terminal integrada de VS Code

La terminal integrada se usa para mostrar errores y warnings de compilación.

No debe ser el lugar principal donde corre el programa cuando la compilación fue exitosa.

El programa exitoso debe correr en la ventana externa.

La terminal integrada debe usarse como panel de diagnóstico cuando la compilación falla.

Compile debe poder escribir en una terminal controlada por Lumen, idealmente con nombre propio, por ejemplo:

```txt
Lumen Compile
```

La terminal debe poder limpiarse antes de cada compilación fallida para que el usuario vea solo el resultado relevante.

## Colores

Compile debe usar colores para mejorar lectura.

Regla visual:

```txt
Errores: rojo.
Warnings: azul.
Información neutra: color normal.
```

Los colores deben aplicarse de forma compatible con terminales ANSI cuando sea posible.

Si el entorno no soporta color, la salida debe seguir siendo legible por texto.

La claridad importa más que el adorno visual.

## Línea de error

Compile debe intentar mostrar la línea relacionada con cada error.

Si GCC reporta una línea, Lumen debe conservar esa información.

Si el error real viene de una causa anterior, como un bracket mal cerrado, Lumen no debe inventar una explicación falsa.

Puede mostrar el error reportado por GCC y, más adelante, Ask Tutor puede ayudar a razonar si la causa está antes.

Compile no debe prometer precisión perfecta en errores de C.

Debe mostrar lo que el compilador reporta de la forma más clara posible.

## Warnings

Los warnings no deben bloquear la ejecución por default.

Si el programa compila con warnings, Lumen puede abrir la ventana externa y también registrar los warnings.

Los warnings deben ser visibles para el usuario, pero no deben impedir correr el programa salvo que un ejercicio específico configure otra cosa.

No se debe activar `-Werror` por default para principiantes.

## Flags iniciales

Los flags iniciales deben favorecer aprendizaje y claridad.

Una base razonable es:

```txt
-Wall
-Wextra
-g
```

`-Wall` y `-Wextra` ayudan a mostrar advertencias útiles.

`-g` conserva información de debugging si Lumen la necesita después.

Los ejercicios o rutas pueden definir flags adicionales si hace falta.

## Archivo principal

Cada ejercicio debe tener un archivo principal.

El caso simple es:

```txt
main.c
```

Si el ejercicio usa otro archivo principal, debe estar declarado en metadata del ejercicio.

Compile no debe adivinar de forma peligrosa qué archivo compilar.

Si no hay archivo principal válido, debe mostrar un error claro.

## Carpeta de build

Compile debe generar artefactos en una zona controlada.

No debe ensuciar la carpeta del usuario con ejecutables y archivos temporales sin orden.

Ejemplo conceptual:

```txt
exercise/
  main.c
  .lumen-build/
    main.exe
```

La carpeta de build puede limpiarse o regenerarse sin tocar el código del usuario.

## Compatibilidad con conio.h

Lumen debe tener en cuenta que muchos cursos introductorios usan librerías antiguas de consola.

`conio.h` es una de las compatibilidades importantes.

Compile debe usar un entorno/toolchain que permita trabajar con ese tipo de librerías cuando sea posible.

Si una función o librería no está disponible en el toolchain seleccionado, Lumen debe mostrar un error claro y no tratarlo como fallo desconocido.

La compatibilidad con `conio.h` es una razón importante para cuidar la elección de MSYS2/UCRT64/GCC y la forma en que se abre la consola externa.

## Validación previa

Antes de compilar, Lumen debe validar:

- Existe ejercicio activo.
- Existe archivo principal.
- El archivo pertenece a un ejercicio válido.
- El ejercicio no está bloqueado.
- GCC está disponible.
- La carpeta de build puede crearse.
- Las rutas están bien resueltas.
- El modo activo permite compilar ese ejercicio.

Si algo falla, Lumen debe mostrar un error controlado.

## Ejercicios bloqueados

Compile no debe compilar ejercicios bloqueados.

Si un ejercicio de ruta está bloqueado y el usuario intenta llegar a él desde Free Mode, el Local Engine debe impedir la operación antes de compilar.

Compile debe asumir que el Local Engine valida permisos, pero también debe rechazar estados inválidos si los detecta.

## Intentos

Cada compilación debe poder registrarse como intento.

La clasificación del intento depende del modo:

```txt
Free Mode -> intento libre.
Route Mode -> intento oficial de ruta.
```

Si un ejercicio de ruta desbloqueado se practica desde Free Mode, ese intento no debe falsear automáticamente los intentos oficiales de la ruta.

El resultado de Compile debe dar suficiente información para registrar:

- Éxito o fallo.
- Errores principales.
- Warnings principales.
- Duración.
- Modo activo.
- Ejercicio activo.
- Toolchain usado.

## Resultado estructurado

Compile debe devolver un resultado estructurado al Extension Host.

Ejemplo conceptual de éxito:

```json
{
  "status": "success",
  "executablePath": "...",
  "warnings": [],
  "durationMs": 120
}
```

Ejemplo conceptual de fallo:

```json
{
  "status": "compile_error",
  "diagnostics": [
    {
      "kind": "error",
      "file": "main.c",
      "line": 39,
      "message": "expected ';' before '}' token"
    }
  ],
  "rawOutput": "..."
}
```

La UI puede presentar estos datos de forma visual.

El resultado no debe depender solo de texto bruto.

## Relación con Ask Tutor

Los errores de compilación deben poder alimentar Ask Tutor.

Si el usuario pide ayuda después de un error, Ask Tutor debe poder recibir:

- Código actual.
- Error principal.
- Warnings relevantes.
- Archivo.
- Línea reportada.
- Ejercicio activo.
- Modo activo.
- Intentos recientes.

Compile no genera la respuesta socrática.

Compile prepara datos útiles.

## Relación con Local Database

Compile debe registrar intentos y errores mediante el Local Engine.

La base local debe recordar lo necesario para continuidad, progreso y ayuda contextual.

No se debe guardar ruido ilimitado de compilación.

La política exacta de retención puede ajustarse después.

## Relación con Extension Host

El Extension Host recibe `F9`.

No compila por su cuenta.

No construye comandos de GCC de forma improvisada.

No decide si un ejercicio está bloqueado.

Debe pedir al Local Engine que compile.

Luego recibe el resultado y decide qué UI mostrar:

- Terminal integrada con errores.
- Ventana externa si compiló.
- Mensaje de fallo controlado si falta toolchain.

## Relación con Lumen Mode

Compile debe respetar Lumen Mode.

Cuando hay errores, debe abrir la terminal integrada aunque el modo esté en Zen Mode.

Pero debe abrir solo lo necesario: terminal de errores.

Cuando la compilación es exitosa, debe abrir ventana externa.

No debe romper el layout de Lumen innecesariamente.

## Performance

Compile debe estar optimizado para respuesta rápida.

Debe evitar trabajo innecesario antes de invocar GCC.

Debe cachear o recordar rutas de toolchain cuando sea seguro.

Debe evitar buscar GCC desde cero en cada `F9` si ya está validado.

Debe evitar operaciones lentas en la UI thread de la extensión.

Debe devolver estado rápido a la UI para que el usuario sepa que la acción inició.

La meta de experiencia es que `F9` se sienta inmediato.

## Fallos esperados

Compile debe manejar estos fallos:

- GCC no encontrado.
- MSYS2/UCRT64 no configurado.
- Archivo principal inexistente.
- Ejercicio no válido.
- Ejercicio bloqueado.
- Error de sintaxis.
- Error de linker.
- Warning relevante.
- Carpeta de build no creable.
- Permisos insuficientes.
- Ruta con espacios mal manejada.
- Consola externa no pudo abrirse.
- Terminal integrada no pudo mostrarse.
- Ejecución terminó con error.
- Programa quedó esperando input.
- Programa entró en loop.

Todos deben producir una respuesta controlada.

## Reglas deterministas

`F9` compila el ejercicio actual.

Si compila correctamente, se abre ventana externa.

Si hay errores de compilación, no se abre ventana externa.

Los errores se muestran en la terminal integrada de VS Code.

La terminal integrada debe mostrar solo la terminal necesaria, no Problems, Output, Debug Console ni Ports.

Errores en rojo.

Warnings en azul.

La experiencia debe imitar la simplicidad de Code::Blocks.

La implementación debe ser nueva y propia de Lumen.

El objetivo es performance-first.

Compile vive dentro del Local Engine.

Compile debe cuidar compatibilidad con librerías antiguas de consola como `conio.h`.

## Resultado esperado

El usuario presiona `F9`.

Lumen responde rápido.

Si el programa compila, se abre una consola externa y el programa corre ahí.

Si el programa no compila, Lumen abre una terminal integrada limpia con errores claros.

El usuario entiende qué falló.

El intento queda registrado.

Ask Tutor puede usar el error como contexto.

La experiencia se siente como una versión moderna, rápida y enfocada del flujo de compilación de Code::Blocks.
