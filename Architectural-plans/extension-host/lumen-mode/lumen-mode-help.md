# Lumen Mode Help

Archivo: `Architectural-plans/extension-host/lumen-mode/lumen-mode-help.md`

## Propósito

`Lumen Mode Help` define cómo Lumen recuerda al usuario qué puede hacer dentro de Lumen Mode.

Esta feature no documenta la lógica interna de compilación, Ask Tutor, Modo Ruta, Modo Libre ni Exit Mode.

Su responsabilidad es mostrar ayuda contextual breve, clara y no invasiva para que el usuario recuerde los comandos, botones y acciones disponibles según el estado actual.

Lumen Mode Help no debe sentirse como un tutorial constante. Debe sentirse como una memoria rápida integrada en la experiencia.

## Principio de diseño

Lumen debe enseñar al usuario a trabajar con comandos.

Los botones existen para descubrir acciones.

Los comandos existen para trabajar rápido.

La ayuda contextual existe para conectar ambas cosas.

Cuando el usuario vea un botón importante, debe poder descubrir su comando equivalente.

Cuando el usuario olvide un comando, debe poder recordarlo sin salir del flujo de trabajo.

## Qué debe mostrar

La ayuda contextual debe mostrar únicamente comandos útiles para el estado actual.

No debe mostrar una lista gigante de todos los comandos de Lumen.

En el estado base de Lumen Mode, la ayuda debe recordar:

```txt
Esc              -> Salir de Lumen Mode
F9               -> Compilar
Ctrl + Shift + R -> Ask Tutor
Ctrl + Shift + P -> Command Palette
```

En Modo Libre, también debe recordar:

```txt
Ctrl + B -> Mostrar u ocultar gestor de archivos
```

La ayuda debe usar descripciones cortas. No debe explicar profundamente qué hace cada comando. Esa explicación vive en los documentos de cada feature.

## Dónde aparece

Lumen Mode Help puede aparecer en varias formas, según el contexto:

* Hover sobre botones importantes.
* Tooltip sobre acciones del panel de Lumen.
* Mini card dentro del panel derecho.
* Ayuda compacta en la pantalla de bienvenida.
* Ayuda contextual dentro del editor cuando el usuario activa Ask Tutor.
* Estado breve dentro de la UI de Lumen cuando una acción requiere guía.

La ayuda principal debe vivir dentro del panel de Lumen, no como un modal global que bloquee el editor.

## Hover sobre botones

Todo botón importante de Lumen debe mostrar su comando equivalente.

Ejemplos:

El botón de compilar debe mostrar `F9`.

El botón de Ask Tutor debe mostrar `Ctrl + Shift + R`.

El botón de salir debe mostrar `Esc`.

El botón de Command Palette o acciones avanzadas puede mostrar `Ctrl + Shift + P`.

El hover debe ser corto, directo y útil.

No debe incluir explicaciones largas.

## Mini card de comandos

Lumen puede mostrar una mini card de comandos dentro del panel derecho.

Esta mini card funciona como una referencia rápida.

Debe poder aparecer en la bienvenida inicial, en la selección de modo y dentro de un ejercicio.

La mini card debe cambiar según el contexto.

En Modo Ruta, debe priorizar resolver, compilar, pedir ayuda y salir.

En Modo Libre, debe incluir también el gestor de archivos.

La mini card no debe ocupar demasiado espacio ni competir con la información principal del ejercicio.

## Ayuda dentro del editor

Cuando el usuario selecciona código y activa Ask Tutor con `Ctrl + Shift + R`, Lumen puede mostrar una pequeña experiencia contextual cerca del editor.

Esta ayuda puede permitir dos acciones rápidas:

Pedir una peripista.

Escribir una pregunta propia.

Si hay selección activa, esa selección debe usarse como contexto.

Si no hay selección activa, se usa el contexto general del ejercicio.

Este documento no define la lógica completa de Ask Tutor. Solo define que la ayuda contextual debe preparar una entrada clara, rápida y no invasiva.

## Ayuda en primera entrada

Durante la primera entrada a Lumen Mode, la bienvenida debe explicar los comandos mínimos.

No debe hacerlo como una documentación larga.

Debe mostrar lo esencial para que el usuario pueda empezar:

`F9` para compilar.

`Ctrl + Shift + R` para Ask Tutor.

`Esc` para salir de Lumen Mode.

`Ctrl + Shift + P` para Command Palette.

La bienvenida debe dejar claro que las acciones también existen como botones visibles.

## Ayuda en Modo Ruta

En Modo Ruta, la ayuda debe reforzar que Lumen guía el flujo.

La ayuda debe priorizar:

Compilar.

Pedir ayuda.

Ver instrucciones.

Continuar o avanzar.

Salir de Lumen Mode.

No debe sugerir al usuario navegar manualmente por carpetas como parte principal del flujo.

En Modo Ruta, el gestor de archivos está oculto por default, así que `Ctrl + B` no debe aparecer como comando principal de ayuda.

## Ayuda en Modo Libre

En Modo Libre, la ayuda debe asumir que el usuario tiene más control.

Debe priorizar:

Buscar ejercicios.

Importar ejercicios.

Crear ejercicios propios.

Compilar.

Pedir ayuda.

Mostrar u ocultar el gestor de archivos.

Salir de Lumen Mode.

En Modo Libre, `Ctrl + B` sí debe aparecer como comando útil porque el gestor de archivos puede estar visible u oculto.

## Comportamiento de Esc

Si una ayuda contextual está abierta y el usuario presiona `Esc`, primero debe cerrarse la ayuda.

Solo si no hay ayuda, mini card, prompt, selector o interacción temporal abierta, `Esc` debe salir de Lumen Mode.

La ayuda contextual se considera UI temporal cuando está abierta de forma interactiva.

## Cuándo no mostrar ayuda

Lumen no debe saturar al usuario con ayuda repetitiva.

La ayuda no debe reaparecer constantemente si el usuario ya la cerró.

La ayuda no debe interrumpir mientras el usuario escribe código.

La ayuda no debe cubrir el código seleccionado salvo que el usuario haya pedido explícitamente una acción contextual.

La ayuda no debe competir con errores importantes, resultados de compilación o respuesta del tutor.

## Memoria de ayuda

Lumen puede recordar si el usuario ya vio ciertas ayudas.

Por ejemplo, si el usuario ya completó la bienvenida inicial, Lumen no necesita repetir la explicación de comandos básicos cada vez.

Sin embargo, los hovers y tooltips de botones deben seguir disponibles siempre.

La memoria de ayuda debe ser local y reversible desde configuración futura.

## Contratos con otros módulos

`enter-lumen-mode` muestra la ayuda inicial cuando corresponde y deja lista la ayuda contextual del modo.

`exit-lumen-mode` cierra cualquier ayuda temporal antes de salir o durante la salida.

`lumen-mode-keybindings` define qué comandos existen y cuándo están activos.

`lumen-mode-layout` define dónde puede aparecer la ayuda sin romper el layout.

`ask-tutor` usa la ayuda contextual cuando el usuario selecciona código y presiona `Ctrl + Shift + R`.

`route-mode` informa qué acciones son relevantes para la ruta actual.

`free-mode` informa qué acciones son relevantes para ejercicios libres, banco de ejercicios y gestor de archivos.

`session-memory` puede recordar qué ayudas ya vio el usuario.

## Reglas deterministas

Todo botón importante debe mostrar su comando equivalente.

La ayuda debe cambiar según el estado actual.

Modo Ruta no debe promover el gestor de archivos como flujo principal.

Modo Libre sí debe mostrar `Ctrl + B` como comando útil.

`Esc` cierra primero ayuda temporal antes de salir de Lumen Mode.

La ayuda no debe ser un tutorial largo.

La ayuda no debe bloquear el flujo de trabajo.

La ayuda debe reforzar el uso de comandos.

## Resultado esperado

El usuario debe poder entender rápidamente qué puede hacer dentro de Lumen Mode.

Debe poder descubrir comandos desde botones.

Debe poder recordar comandos sin abrir documentación externa.

Debe poder usar Lumen con mouse al principio y con teclado a medida que aprende.

La ayuda debe acompañar el flujo sin interrumpirlo.
