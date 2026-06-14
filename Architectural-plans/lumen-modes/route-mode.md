# Route Mode

Archivo: `Architectural-plans/lumen-modes/route-mode.md`

## Propósito

`Route Mode` define la forma guiada de usar Lumen.

Este modo existe para que el usuario aprenda siguiendo una progresión estructurada. Lumen decide qué viene después, qué ejercicios pertenecen a cada módulo, cuándo se desbloquea una parte nueva y qué debe reforzarse según el progreso del usuario.

Route Mode no reemplaza Free Mode. Tiene otro objetivo.

Free Mode le da libertad al usuario para practicar lo que necesita ahora.

Route Mode guía al usuario por una progresión.

## Qué es Route Mode

Route Mode es el modo donde Lumen funciona como una experiencia de aprendizaje guiada.

El usuario entra a una ruta, por ejemplo `Ruta C`, y avanza por módulos, ejercicios, retos, quizzes o proyectos según la estructura de esa ruta.

La ruta no debe sentirse como una simple lista de archivos. Debe sentirse como un camino de progreso.

Lumen debe mostrar al usuario dónde está, qué está haciendo ahora, qué viene después y qué necesita completar para avanzar.

En Route Mode, Lumen toma más control sobre la experiencia. El usuario no tiene que buscar manualmente carpetas ni decidir qué archivo abrir. Lumen debe abrir el ejercicio correcto y guiar el flujo desde su panel derecho.

## Qué no es Route Mode

Route Mode no es una colección libre de ejercicios.

No es una carpeta para que el usuario cree ejercicios propios.

No espera que el usuario navegue manualmente por archivos para saber qué hacer.

No muestra el gestor de archivos por default.

No debe permitir que el progreso de la ruta se mezcle automáticamente con prácticas libres sin una regla explícita.

No debe permitir que el usuario salte ejercicios bloqueados desde Free Mode.

Route Mode es una experiencia guiada, no una exploración libre del workspace.

## Entrada a Route Mode

El usuario puede entrar a Route Mode desde la selección de modos de Lumen.

Cuando el usuario elige Route Mode, Lumen debe preparar una experiencia guiada.

El layout esperado es el default de Route Mode definido por `lumen-mode-layout.md`:

- Gestor de archivos oculto.
- Editor de código en el centro.
- Panel de Lumen a la derecha.

El gestor de archivos está oculto porque en Route Mode el usuario no debe depender de carpetas para avanzar.

El panel derecho de Lumen debe actuar como guía principal de la ruta.

## Estado inicial de Route Mode

Al entrar a Route Mode, Lumen debe decidir qué mostrar.

Si el usuario ya tiene una ruta activa, Lumen debe abrir esa ruta.

Si el usuario tenía un ejercicio pendiente dentro de la ruta, Lumen debe ofrecer continuar ese ejercicio o abrirlo directamente si esa fue la última acción útil.

Si no hay ruta activa, Lumen debe mostrar la selección de rutas disponibles.

Si hay ruta activa pero no hay ejercicio pendiente, Lumen debe mostrar el punto actual de la ruta y el siguiente paso recomendado.

El usuario no debe entrar a una pantalla vacía.

## Selección de ruta

Route Mode debe permitir elegir una ruta disponible.

La primera ruta principal es `Ruta C`.

Cada ruta representa una progresión completa de aprendizaje. Una ruta puede estar dividida en módulos, lecciones, ejercicios, retos, quizzes y proyectos.

La selección de ruta debe ser clara. El usuario debe entender qué aprenderá en esa ruta y cuál es su estado actual.

Si el usuario ya empezó una ruta, Lumen debe mostrar progreso y opción de continuar.

Si el usuario nunca empezó una ruta, Lumen debe mostrar una entrada limpia para comenzar.

## Ruta activa

Route Mode debe tener el concepto de ruta activa.

La ruta activa es la ruta que Lumen está guiando en ese momento.

Dentro de la ruta activa, Lumen debe saber:

- Módulo actual.
- Ejercicio activo.
- Ejercicios completados.
- Ejercicios disponibles.
- Ejercicios bloqueados.
- Próximo paso recomendado.
- Estado de progreso.
- Errores o conceptos débiles relevantes.

La ruta activa debe recuperarse después de cerrar Lumen Mode o reiniciar VS Code.

## Módulos de una ruta

Una ruta debe organizarse en módulos.

Un módulo agrupa ejercicios y actividades relacionadas con un tema o conjunto de temas.

Por ejemplo, en una Ruta C podrían existir módulos como:

- Fundamentos.
- Condicionales.
- Bucles.
- Funciones.
- Arrays.
- Cadenas.
- Matrices.
- Punteros.
- Structs.
- Archivos.
- Memoria dinámica.

Los nombres exactos pueden cambiar, pero la idea debe mantenerse: la ruta se entiende por módulos, no por carpetas sueltas.

## Progresión

Route Mode debe manejar progresión.

La progresión define qué puede hacer el usuario ahora y qué se desbloquea después.

Un módulo puede tener ejercicios obligatorios, ejercicios de refuerzo, quizzes, retos o proyectos.

El usuario no necesariamente debe hacer todos los ejercicios existentes de un módulo para avanzar. Lumen puede tener más ejercicios disponibles que ejercicios obligatorios.

La ruta debe distinguir entre:

- Ejercicios obligatorios.
- Ejercicios recomendados.
- Ejercicios de refuerzo.
- Ejercicios extra.
- Retos o gates de dominio.
- Quizzes o comprobaciones teóricas.
- Proyectos o prácticas integradoras.

La regla importante es que avanzar en la ruta debe depender de criterios definidos por Lumen, no de que el usuario simplemente abra archivos.

## Gates de avance

Route Mode puede usar gates para decidir si el usuario avanza.

Un gate es una condición que debe cumplirse para desbloquear la siguiente parte de la ruta.

Un gate puede depender de ejercicios completados, intentos, errores, quizzes, retos, proyectos o dominio de conceptos.

Este documento no define la fórmula exacta de mastery ni el scoring. Eso pertenece a los módulos de progreso y evaluación.

La regla de Route Mode es que la UI debe explicar claramente por qué algo está bloqueado y qué falta para desbloquearlo.

## Colección de ejercicios y desbloqueos

La colección de ejercicios puede mostrar ejercicios de Free Mode y ejercicios que pertenecen a rutas.

Sin embargo, los ejercicios de ruta no deben estar disponibles libremente desde el inicio.

Un ejercicio que pertenece a una ruta debe aparecer bloqueado en la colección hasta que el usuario lo desbloquee avanzando en su ruta correspondiente.

La colección puede mostrarlo como bloqueado, con su nombre, módulo, tema o silueta visual, pero no debe permitir importarlo, abrirlo ni resolverlo en Free Mode mientras esté bloqueado.

La razón es evitar que el usuario haga trampa sin querer o intencionalmente: si resuelve en Free Mode un ejercicio que todavía no desbloqueó en la ruta, la ruta perdería control sobre intentos, progreso, dificultad real y gates.

La lógica debe parecerse a un juego: ciertos personajes, arenas o misiones pueden verse en modos libres, pero siguen bloqueados hasta avanzar en la historia.

En Lumen, la historia es Route Mode.

Free Mode puede mostrar la colección.

Route Mode decide qué ejercicios de ruta se desbloquean.

## Ejercicios de ruta en Free Mode

Cuando un ejercicio de ruta ya fue desbloqueado en Route Mode, puede aparecer como disponible en la colección dentro de Free Mode.

Eso no significa que el progreso libre y el progreso de ruta sean lo mismo.

Si el usuario practica un ejercicio de ruta desbloqueado desde Free Mode, Lumen debe registrar esa práctica como práctica libre o intento libre, salvo que el sistema de progreso defina explícitamente otra regla.

El objetivo es permitir repasar ejercicios ya desbloqueados sin romper la progresión de la ruta.

La regla base es:

- Si el ejercicio de ruta está bloqueado, Free Mode no puede importarlo ni resolverlo.
- Si el ejercicio de ruta está desbloqueado, Free Mode puede permitir practicarlo.
- Los intentos libres no deben falsear el historial de intentos de la ruta.
- Cualquier excepción debe estar definida por el módulo de progreso.

## Ejercicio activo

Route Mode debe tener el concepto de ejercicio activo.

El ejercicio activo es el ejercicio de la ruta que Lumen espera que el usuario trabaje en ese momento.

Cuando hay ejercicio activo, el editor central debe mostrar el archivo principal del ejercicio, normalmente un `.c`.

El panel derecho de Lumen debe mostrar la información necesaria para resolverlo: enunciado, objetivo, restricciones, ejemplos, acciones disponibles, errores recientes, estado de progreso y acceso a Ask Tutor.

El usuario puede escribir código en el editor, pero la guía vive en el panel derecho de Lumen.

## Materialización local de ejercicios

Aunque Route Mode sea guiado, los ejercicios deben existir localmente cuando el usuario los trabaja.

Cuando Lumen abre o importa un ejercicio de ruta, debe materializarlo dentro del espacio local correspondiente a esa ruta.

La estructura física existe para que VS Code pueda abrir archivos reales y para que Lumen pueda compilar, ejecutar y guardar intentos.

Pero en Route Mode esa estructura no debe ser el centro de la experiencia.

El usuario no debería tener que entender la carpeta interna de la ruta para avanzar.

## Gestor de archivos en Route Mode

En Route Mode, el gestor de archivos debe estar oculto por default.

El usuario trabaja desde la ruta y desde el panel de Lumen, no desde el árbol de carpetas.

El gestor de archivos puede existir físicamente y VS Code puede tener archivos abiertos, pero el flujo principal no depende de que el usuario navegue manualmente.

Si en el futuro se permite mostrar el gestor de archivos en Route Mode, debe tratarse como opción avanzada o configuración explícita, no como default.

## Panel derecho de Lumen en Route Mode

El panel derecho de Lumen debe ser el centro de control de Route Mode.

Dependiendo del estado, puede mostrar:

- Selección de ruta.
- Mapa o camino de la ruta.
- Módulo actual.
- Ejercicio activo.
- Enunciado del ejercicio.
- Progreso.
- Gates o requisitos para avanzar.
- Errores recientes.
- Recomendaciones de refuerzo.
- Acceso a Ask Tutor.
- Ayuda contextual.
- Siguiente paso recomendado.

El panel derecho no debe reemplazar al editor.

El usuario programa en el centro y usa Lumen a la derecha como guía de aprendizaje.

## Compilación en Route Mode

Route Mode debe permitir compilar el ejercicio actual con el comando definido por Lumen.

El documento de keybindings define `F9` como entrada rápida.

Este documento no define la lógica profunda de compilación. Esa lógica pertenece al módulo de compilación.

La regla de Route Mode es que todo ejercicio activo de la ruta debe poder pasar por el flujo de compilación de Lumen.

Los resultados de compilación deben alimentar el progreso, los intentos, errores y recomendaciones de la ruta cuando corresponda.

## Ask Tutor en Route Mode

Route Mode debe permitir usar Ask Tutor sobre el ejercicio actual.

Si el usuario selecciona código y activa Ask Tutor, Lumen debe usar esa selección como contexto.

Si no hay selección, Lumen debe usar el contexto general del ejercicio activo.

En Route Mode, Ask Tutor debe tener contexto pedagógico adicional: ruta actual, módulo actual, ejercicio activo, conceptos esperados, errores recientes e intentos.

La respuesta del tutor debe seguir la filosofía socrática de Lumen.

El tutor no debe regalar la solución final.

La lógica profunda de Ask Tutor vive en su propio módulo.

## Registro de progreso

Route Mode debe registrar progreso real.

No basta con saber que el usuario abrió un archivo.

Lumen debe registrar información útil como ejercicios completados, intentos, errores, compilaciones, avance por módulos, conceptos débiles y gates superados.

Este registro permite que la ruta se adapte, recomiende refuerzo y sepa qué desbloquear después.

El modelo exacto de progreso pertenece al módulo de progreso o database.

La regla de Route Mode es que la experiencia guiada depende de progreso persistente y confiable.

## Recomendaciones y refuerzo

Route Mode puede recomendar ejercicios de refuerzo.

Si el usuario falla muchas veces en un concepto, Lumen puede sugerir ejercicios extra antes de avanzar.

Los ejercicios de refuerzo no deben sentirse como castigo. Deben sentirse como ayuda para cerrar una brecha.

La recomendación profunda pertenece al Local Engine o al módulo de progreso.

Route Mode solo define que la ruta puede mostrar recomendaciones y actuar sobre ellas.

## Relación con Free Mode

Route Mode y Free Mode pueden compartir ejercicios, engine, compilación, Ask Tutor y base de datos local.

La diferencia está en la experiencia de uso.

En Route Mode, Lumen decide la progresión y guía al usuario.

En Free Mode, el usuario decide qué trabajar.

La colección de ejercicios puede contener ejercicios de ruta, pero esos ejercicios deben respetar su estado de bloqueo.

Un ejercicio de ruta bloqueado no debe poder resolverse desde Free Mode.

Un ejercicio de ruta desbloqueado puede estar disponible para práctica libre, pero sus intentos libres no deben confundirse automáticamente con los intentos oficiales de la ruta.

Si un intento libre puede contar para una ruta, esa regla debe estar explícitamente definida por el sistema de progreso.

## Relación con la colección de ejercicios

Route Mode no es la colección de ejercicios, pero sí controla parte de lo que la colección permite hacer.

La colección puede mostrar ejercicios con distintos estados:

- Disponible.
- Bloqueado por ruta.
- Desbloqueado por ruta.
- Importado.
- No importado.
- Recomendado.
- Refuerzo sugerido.

Los ejercicios bloqueados por ruta pueden mostrarse como contenido futuro, pero no deben poder abrirse ni importarse hasta que la ruta correspondiente los desbloquee.

Esto protege la integridad pedagógica de Route Mode.

## Relación con el Local Engine

Route Mode depende del Local Engine para resolver operaciones reales.

El panel de Lumen puede mostrar la ruta, botones y vistas, pero el Local Engine debe encargarse de decisiones importantes:

- Resolver ruta activa.
- Resolver módulo actual.
- Resolver ejercicio activo.
- Materializar ejercicio.
- Validar estructura.
- Preparar compilación.
- Registrar intento.
- Registrar error.
- Actualizar progreso.
- Evaluar gates.
- Desbloquear ejercicios en la colección.
- Recomendar refuerzo.
- Consultar estado local.

Route Mode no debe meter esta lógica pesada dentro de la webview.

La webview muestra.

El Extension Host coordina.

El Local Engine decide y ejecuta.

## Relación con la base de datos local

Route Mode necesita persistencia local.

La base local debe recordar ruta activa, módulo actual, ejercicio activo, progreso, intentos, errores, gates, ejercicios desbloqueados y estado mínimo de sesión.

También debe recordar qué ejercicios de ruta están bloqueados o desbloqueados para la colección de ejercicios.

Este documento no define tablas exactas.

La estructura exacta de datos pertenece al módulo de database.

La regla de Route Mode es que el usuario no debe perder su progreso por cerrar Lumen Mode o reiniciar VS Code.

## Estados principales de Route Mode

Route Mode debe manejar estos estados principales:

- Sin ruta activa.
- Seleccionando ruta.
- Ruta activa sin ejercicio pendiente.
- Módulo actual abierto.
- Ejercicio activo abierto.
- Error de compilación.
- Ask Tutor abierto.
- Gate pendiente.
- Refuerzo recomendado.
- Módulo completado.
- Ruta completada.

Cada estado debe tener una UI clara en el panel derecho de Lumen.

## Fallos esperados

Route Mode debe manejar fallos sin romper el workspace.

Si falla la materialización de un ejercicio, Lumen debe mostrar un error controlado y permitir intentar de nuevo.

Si el archivo activo ya no existe, Lumen debe reconstruirlo si es posible o pedir una recuperación segura.

Si la ruta activa no existe, Lumen debe volver a la selección de rutas.

Si la compilación falla, Lumen debe mostrar el error, registrarlo y permitir continuar trabajando.

Si Ask Tutor no está disponible, Lumen debe permitir seguir resolviendo el ejercicio.

Si el progreso local se corrompe o queda inconsistente, Lumen debe intentar reparar o volver a un estado seguro sin borrar trabajo del usuario.

## Reglas deterministas

Route Mode oculta el gestor de archivos por default.

Route Mode muestra el editor en el centro.

Route Mode muestra Lumen a la derecha.

Route Mode guía la progresión del usuario.

Route Mode abre el ejercicio correcto cuando existe un ejercicio activo.

Route Mode no obliga al usuario a navegar manualmente por carpetas.

Route Mode registra progreso real.

Route Mode puede bloquear o desbloquear partes de la ruta según gates definidos.

Route Mode controla qué ejercicios de ruta quedan desbloqueados en la colección de ejercicios.

Los ejercicios de ruta bloqueados no pueden resolverse desde Free Mode.

Los ejercicios de ruta desbloqueados pueden practicarse libremente, pero sus intentos libres no deben falsear el progreso oficial de la ruta.

Route Mode puede recomendar refuerzo.

Route Mode permite compilar ejercicios de ruta.

Route Mode permite Ask Tutor con contexto de ruta, módulo y ejercicio.

Route Mode no debe depender de internet para trabajar sobre ejercicios ya materializados localmente.

## Resultado esperado

Al entrar en Route Mode, el usuario debe sentir que está dentro de una ruta guiada.

Puede ver dónde está.

Puede ver qué ejercicio toca ahora.

Puede abrir y resolver el ejercicio activo.

Puede compilar.

Puede pedir ayuda.

Puede ver errores.

Puede avanzar cuando cumple los requisitos.

Puede recibir refuerzo si está fallando.

Puede desbloquear ejercicios que luego aparecen disponibles en la colección de ejercicios.

Puede continuar después.

Route Mode convierte Lumen en una experiencia de aprendizaje estructurada, no solo en un editor con ejercicios sueltos.
