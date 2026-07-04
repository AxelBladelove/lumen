# Free Mode

Archivo: `Architectural-plans/lumen-modes/free-mode.md`

## Propósito

`Free Mode` define la forma libre de usar Lumen.

## Estado actual del repo

Free Mode todavía no está implementado. No hay selección de modo, UI de banco o
colección, creación de ejercicios propios, importación de ejercicios,
compilación, Ask Tutor ni layout específico de Modo Libre.

El repo actual solo abre la Route Path View mockeada.

Este modo existe para que el usuario pueda practicar, importar o crear ejercicios sin seguir una ruta guiada. Es el modo donde Lumen funciona más como un entorno de práctica asistida: el usuario decide qué quiere trabajar y Lumen le da herramientas para compilar, pedir ayuda, registrar errores, revisar intentos y mantener progreso local.

Free Mode no reemplaza Modo Ruta. Tiene otro objetivo.

Modo Ruta guía al usuario por una progresión.

Free Mode le da libertad al usuario para practicar lo que necesita ahora.

## Qué es Free Mode

Free Mode es el modo donde el usuario puede trabajar con ejercicios sin estar obligado a avanzar por una ruta.

El usuario puede entrar al banco de ejercicios de Lumen, buscar un tema específico, importar un ejercicio y resolverlo directamente.

También puede crear ejercicios propios para tareas, prácticas del profesor, problemas externos o ideas personales.

La idea es que Lumen no sea útil solo cuando el usuario sigue una ruta oficial. Lumen también debe servir como una herramienta diaria para practicar C, resolver problemas sueltos y trabajar ejercicios que no necesariamente nacieron dentro del catálogo de Lumen.

## Qué no es Free Mode

Free Mode no es una ruta.

No tiene desbloqueos obligatorios.

No obliga al usuario a completar módulos anteriores.

No decide por el usuario qué ejercicio debe resolver después.

No oculta el gestor de archivos por default.

No trata la estructura de carpetas como algo invisible para el usuario.

En Free Mode, el usuario tiene más control sobre sus archivos y ejercicios.

## Entrada a Free Mode

El usuario puede entrar a Free Mode desde la selección de modos de Lumen.

Cuando el usuario elige Free Mode, Lumen debe preparar un espacio de trabajo flexible.

El layout esperado es el default de Free Mode definido por `lumen-mode-layout.md`:

- Gestor de archivos visible a la izquierda.
- Editor de código en el centro.
- Panel de Lumen a la derecha.

El gestor de archivos está visible porque en Free Mode el usuario puede crear carpetas, abrir archivos, importar ejercicios y organizar ejercicios propios.

El panel derecho de Lumen debe actuar como centro de control del modo libre.

## Estado inicial de Free Mode

Al entrar a Free Mode, Lumen debe decidir qué mostrar.

Si el usuario tenía un ejercicio libre pendiente, Lumen debe ofrecer continuar ese ejercicio o abrirlo directamente si esa fue la última acción útil.

Si no hay ejercicio pendiente, Lumen debe mostrar la pantalla principal de Free Mode.

La pantalla principal de Free Mode debe permitir tres acciones principales:

- Buscar ejercicios del banco de Lumen.
- Importar un ejercicio oficial.
- Crear un ejercicio propio.

Estas tres acciones son la base del modo libre.

## Banco de ejercicios en Free Mode

Free Mode debe permitir acceder al banco de ejercicios de Lumen sin pasar por una ruta.

El usuario debe poder buscar ejercicios por tema, dificultad, tipo de problema o cualquier metadata útil que Lumen tenga disponible.

Por ejemplo, si el usuario quiere practicar matrices, no debe tener que avanzar por una ruta hasta llegar a matrices. Debe poder buscar “matrices”, ver ejercicios relacionados e importar directamente uno.

El banco de ejercicios no necesariamente tiene que mostrar todo de golpe si eso vuelve la UI pesada. Puede existir una pantalla inicial que pregunte qué tipo de ejercicio quiere practicar, o puede existir una lista general con filtros. Esa decisión pertenece al diseño del banco, pero Free Mode debe soportar ambos enfoques.

La regla importante es que Free Mode debe permitir llegar rápido a un ejercicio específico sin progresión obligatoria.

## Importar ejercicios oficiales

Cuando el usuario importa un ejercicio oficial desde el banco de Lumen, ese ejercicio debe copiarse o materializarse dentro del espacio local de Free Mode.

El ejercicio importado debe quedar como una carpeta propia dentro del área de ejercicios libres.

Dentro de esa carpeta debe existir el archivo o archivos de trabajo necesarios, normalmente un archivo `.c`.

El usuario debe poder abrir, editar, compilar y pedir ayuda sobre ese ejercicio igual que en cualquier otro flujo de Lumen.

Una vez importado, el ejercicio debe funcionar localmente. El usuario no debería depender de internet para abrirlo o resolverlo después.

## Crear ejercicios propios

Free Mode debe permitir crear ejercicios propios.

Crear un ejercicio propio significa crear una carpeta nueva dentro del área de ejercicios libres y preparar ahí el archivo o archivos necesarios para trabajar.

El caso más simple es:

```txt
ejercicios/
  nombre-del-ejercicio/
    main.c
```

El nombre exacto del archivo puede variar según el flujo, pero Lumen debe ofrecer un punto de entrada simple para empezar a programar.

Los ejercicios propios no necesitan venir del catálogo oficial de Lumen.

Aun así, deben poder usar las funciones principales del producto:

- Compilar.
- Ejecutar.
- Pedir ayuda a Ask Tutor.
- Registrar errores.
- Registrar intentos.
- Mantener progreso local.
- Reabrirse más tarde.

Free Mode es importante porque permite que Lumen acompañe también tareas externas, ejercicios del profesor o prácticas improvisadas.

## Ejercicio activo

Free Mode debe tener el concepto de ejercicio activo.

El ejercicio activo es el ejercicio sobre el que Lumen trabaja en ese momento.

Cuando hay ejercicio activo, el editor central debe mostrar el archivo principal del ejercicio, normalmente un `.c`.

El panel derecho de Lumen debe mostrar información útil del ejercicio actual: nombre, estado, acciones disponibles, errores recientes, intentos, ayuda y opciones de navegación.

Si el usuario cambia manualmente de archivo dentro del gestor de archivos, Lumen debe intentar entender si ese archivo pertenece al ejercicio activo, a otro ejercicio libre o a un archivo no reconocido.

Si el archivo no pertenece a un ejercicio reconocido, Lumen puede mostrar una opción para ocultar el panel de Lumen, o botones en el panel derecho para mostrar comandos, crear ejercicio o ir a la colección de ejercicios.

## Gestor de archivos en Free Mode

En Free Mode, el gestor de archivos es parte normal del flujo.

Debe estar visible por default.

El usuario puede ocultarlo o mostrarlo con `Ctrl + B`, según lo definido en `lumen-mode-keybindings.md`.

Lumen no debe pelear contra el usuario si decide ocultar el gestor de archivos durante la sesión activa.

Si el usuario vuelve a entrar a Free Mode desde cero, el default vuelve a ser gestor de archivos visible.

El gestor de archivos en Free Mode debe servir para que el usuario entienda dónde están sus ejercicios, cree archivos cuando haga falta y trabaje con ejercicios propios sin sentir que Lumen le esconde todo.

## Panel derecho de Lumen en Free Mode

El panel derecho de Lumen debe ser el centro de control de Free Mode.

Dependiendo del estado, puede mostrar:

- coleccion de ejercicios.
- Filtros.
- Ejercicios importados.
- Crear ejercicio propio.
- Información del ejercicio activo.
- Acceso a Ask Tutor.
- Ayuda contextual.

El panel derecho no debe reemplazar al editor.

El usuario escribe código en el centro y usa Lumen a la derecha para guiar, buscar, entender o pedir ayuda.

## Compilación en Free Mode

Free Mode debe permitir compilar el ejercicio actual con el comando definido por Lumen.

El documento de keybindings define `F9` como entrada rápida.

Este documento no define la lógica profunda de compilación. Esa lógica pertenece al módulo de compilación.

La regla de Free Mode es que todo ejercicio libre válido debe poder pasar por el flujo de compilación de Lumen.

Esto aplica tanto a ejercicios oficiales importados como a ejercicios creados por el usuario.

## Ask Tutor en Free Mode

Free Mode debe permitir usar Ask Tutor sobre el ejercicio actual.

Si el usuario selecciona código y activa Ask Tutor, Lumen debe usar esa selección como contexto.

Si no hay selección, Lumen debe usar el contexto general del ejercicio activo.

Free Mode debe permitir Ask Tutor tanto en ejercicios importados como en ejercicios propios.

El tutor no debe depender de que el ejercicio venga de una ruta oficial.

La lógica profunda de Ask Tutor vive en su propio módulo.

## Registro de errores e intentos

Free Mode debe registrar información útil del trabajo del usuario.

Como mínimo, debe poder registrar intentos de compilación, errores recientes y estado básico del ejercicio.

Este registro permite que Lumen ayude mejor al usuario y que el usuario pueda revisar su progreso aunque no esté siguiendo una ruta.

El registro de errores e intentos no debe convertir Free Mode en una ruta. No hay obligación de completar una secuencia. Solo existe memoria útil de práctica.

## Relación con Modo Ruta

Free Mode y Modo Ruta pueden compartir ejercicios, engine, compilación, Ask Tutor y base de datos local.

La diferencia está en la experiencia de uso.

En Modo Ruta, Lumen decide la progresión y guía al usuario.

En Free Mode, el usuario decide qué trabajar.

Un ejercicio del banco de Lumen puede existir en una ruta y también estar disponible para importación libre, pero el progreso de una ruta y el progreso libre no deben confundirse automáticamente.

Si en el futuro Lumen permite que un ejercicio libre cuente para una ruta, esa decisión debe documentarse explícitamente en Modo Ruta o Progress, no aquí.

## Relación con el Local Engine

Free Mode depende del Local Engine para resolver operaciones reales.

El panel de Lumen puede mostrar botones y vistas, pero el Local Engine debe encargarse de las decisiones importantes:

- Crear ejercicio.
- Importar ejercicio.
- Validar estructura.
- Detectar ejercicio activo.
- Preparar compilación.
- Registrar intento.
- Registrar error.
- Consultar estado local.

Free Mode no debe meter esta lógica pesada dentro de la webview.

La webview muestra.

El Extension Host coordina.

El Local Engine decide y ejecuta.

## Relación con la base de datos local

Free Mode necesita persistencia local.

La base local debe recordar ejercicios importados, ejercicios creados, último ejercicio activo, intentos, errores y estado mínimo de sesión.

Este documento no define tablas exactas.

La estructura exacta de datos pertenece al módulo de database.

La regla de Free Mode es que el usuario no debe perder su trabajo ni su estado por cerrar Lumen Mode o reiniciar VS Code.

## Estados principales de Free Mode

Free Mode debe manejar estos estados principales:

- Sin ejercicio activo.
- Explorando coleccion de ejercicios.
- Importando ejercicio.
- Creando ejercicio propio.
- Ejercicio activo abierto.
- Error de compilación.
- Ask Tutor abierto.


## Fallos esperados

Free Mode debe manejar fallos sin romper el workspace.

Si falla la importación de un ejercicio, Lumen debe mostrar un error controlado y permitir intentar de nuevo.

Si el archivo activo ya no existe, Lumen debe limpiar el estado o pedir al usuario seleccionar otro archivo.

Si la compilación falla, Lumen debe mostrar el error y registrarlo.

Si Ask Tutor no está disponible, Lumen debe permitir seguir trabajando sin bloquear el ejercicio.

## Reglas deterministas

Free Mode muestra el gestor de archivos por default.

Free Mode muestra el editor en el centro.

Free Mode muestra Lumen a la derecha.

Free Mode permite importar ejercicios oficiales sin seguir una ruta.

Free Mode permite crear ejercicios propios.

Free Mode debe funcionar localmente después de importar o crear un ejercicio.

Free Mode permite compilar ejercicios oficiales y propios.

Free Mode permite Ask Tutor en ejercicios oficiales y propios.

Free Mode registra errores e intentos sin convertir la práctica en una ruta.

Free Mode no debe depender de internet para trabajar sobre ejercicios ya importados.

## Resultado esperado

Al entrar en Free Mode, el usuario debe sentir que tiene un espacio flexible de práctica.

Puede buscar ejercicios del banco de Lumen.

Puede importar un ejercicio específico.

Puede crear un ejercicio propio.

Puede abrir su archivo `.c`.

Puede compilar.

Puede pedir ayuda.

Puede ver errores.

Puede continuar después.

Free Mode convierte Lumen en una herramienta diaria de práctica, no solo en una ruta guiada.
