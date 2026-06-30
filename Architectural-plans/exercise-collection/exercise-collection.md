# Exercise Collection

Archivo: `Architectural-plans/exercise-collection/exercise-collection.md`

## Propósito

`Exercise Collection` define la colección de ejercicios de Lumen.

## Estado actual del repo

La colección de ejercicios todavía no está implementada. No hay UI de
colección, filtros, importación, paquetes `.esex`, metadata local/remota ni
operaciones de Local Engine para listar o materializar ejercicios.

El mock actual solo define siete nodos visuales dentro de
`frontend/src/route-path-view/data/mockRouteModule.ts`.

La colección es el lugar donde el usuario puede ver, buscar, filtrar, importar o revisar ejercicios disponibles.

Esta colección se usa principalmente desde Free Mode, pero también contiene ejercicios que pertenecen a rutas.

La regla importante es que no todos los ejercicios visibles en la colección están necesariamente disponibles para resolver. Algunos ejercicios pueden estar bloqueados porque pertenecen a una ruta y todavía no han sido desbloqueados por el usuario.

## Qué es la colección de ejercicios

La colección de ejercicios es el catálogo navegable de ejercicios de Lumen.

Puede incluir ejercicios libres, ejercicios de práctica, ejercicios recomendados, ejercicios importados y ejercicios que pertenecen a rutas.

La colección no es una ruta.

La colección no decide el progreso guiado del usuario.

La colección muestra ejercicios y sus estados.

Route Mode decide el desbloqueo de los ejercicios que pertenecen a rutas.

Free Mode permite practicar ejercicios disponibles sin seguir una ruta.

## Qué no es la colección de ejercicios

La colección de ejercicios no es el workspace local completo.

No es la base de datos.

No es el sistema de progreso.

No es el Local Engine.

No es Modo Ruta.

No es Free Mode.

La colección es una capa de acceso y descubrimiento. Muestra qué ejercicios existen, cuáles están disponibles, cuáles están bloqueados, cuáles fueron importados y cuáles se pueden practicar.

## Estados de un ejercicio

Un ejercicio dentro de la colección puede tener varios estados.

Los estados base son:

- Disponible.
- Bloqueado.
- Desbloqueado por ruta.
- Importado.
- No importado.
- Recomendado.
- Refuerzo sugerido.

Un ejercicio disponible puede importarse o abrirse según el modo actual.

Un ejercicio bloqueado puede mostrarse, pero no puede importarse, abrirse ni resolverse.

Un ejercicio importado ya existe localmente y puede abrirse sin depender de internet.

Un ejercicio recomendado puede aparecer destacado porque Lumen considera que ayuda al usuario en ese momento.

## Ejercicios libres

Los ejercicios libres son ejercicios que no están bloqueados por una ruta.

Pueden ser importados desde Free Mode sin necesidad de avanzar por Modo Ruta.

Sirven para practicar temas concretos, resolver problemas sueltos o reforzar conocimientos sin seguir una progresión obligatoria.

Un ejercicio libre puede tener metadata como tema, dificultad, tipo de problema, lenguaje, conceptos y fuente.

## Ejercicios de ruta

Los ejercicios de ruta son ejercicios que pertenecen a una ruta guiada.

Pueden aparecer dentro de la colección de ejercicios, pero no necesariamente están disponibles desde el inicio.

Si un ejercicio pertenece a una ruta y todavía no ha sido desbloqueado por el usuario, debe aparecer bloqueado.

La colección puede mostrar que el ejercicio existe, puede mostrar su tema o módulo, e incluso puede mostrarlo como contenido futuro, pero no debe permitir importarlo, abrirlo ni resolverlo desde Free Mode mientras esté bloqueado.

## Desbloqueo de ejercicios de ruta

Un ejercicio de ruta se desbloquea avanzando en Route Mode.

Cuando Route Mode determina que un ejercicio fue desbloqueado, la colección debe reflejar ese estado.

Después de desbloquearse, el ejercicio puede estar disponible para práctica libre si la regla de progreso lo permite.

La colección no decide por sí sola que un ejercicio de ruta se desbloqueó.

La autoridad del desbloqueo pertenece a Route Mode, al Local Engine y al sistema de progreso.

## Por qué existen bloqueos

Los bloqueos existen para proteger la integridad de la ruta.

Si un usuario pudiera resolver desde Free Mode un ejercicio que todavía no desbloqueó en Route Mode, podría alterar el sentido real del progreso.

También podría ocurrir que el usuario practicara el mismo ejercicio antes de tiempo y luego la ruta registrara menos intentos oficiales de los que realmente tuvo.

Eso haría que el progreso, los errores, los gates y la dificultad percibida fueran menos confiables.

Por eso, los ejercicios de ruta deben comportarse como contenido bloqueado hasta que el usuario llegue al punto correcto de la ruta.

La idea es parecida a un juego donde ciertos personajes, arenas o misiones pueden verse en modos libres, pero siguen bloqueados hasta avanzar en la historia.

En Lumen, la historia es Route Mode.

## Ejercicios desbloqueados en Free Mode

Cuando un ejercicio de ruta ya fue desbloqueado, la colección puede permitir practicarlo desde Free Mode.

Eso no significa que todo intento libre cuente automáticamente como intento oficial de la ruta.

La regla base es:

- Ejercicio de ruta bloqueado: visible si Lumen quiere mostrarlo, pero no resoluble.
- Ejercicio de ruta desbloqueado: puede practicarse libremente si el sistema lo permite.
- Intento de Free Mode: se registra como intento libre.
- Intento de Route Mode: se registra como intento de ruta.
- Cualquier mezcla entre ambos debe estar definida explícitamente por el sistema de progreso.

Esto evita que Free Mode falsee el historial oficial de Route Mode.

## Importación de ejercicios

Importar un ejercicio significa materializarlo localmente.

Cuando el usuario importa un ejercicio disponible, Lumen debe crear o preparar los archivos necesarios en el espacio local correspondiente.

En Free Mode, el ejercicio importado vive dentro del área de ejercicios libres.

En Route Mode, el ejercicio materializado vive dentro del área local de la ruta correspondiente.

La colección muestra y permite la acción de importar, pero la operación real debe resolverla el Local Engine.

## Ejercicios ya importados

Un ejercicio importado debe poder abrirse localmente.

Si el ejercicio ya fue importado, la colección debe mostrar ese estado para evitar importaciones duplicadas innecesarias.

El usuario debe poder continuar un ejercicio importado sin descargarlo otra vez.

Si el ejercicio importado fue actualizado en la colección remota, Lumen debe tratar esa actualización con cuidado para no sobrescribir trabajo del usuario.

La política profunda de actualización pertenece al sistema de paquetes o sincronización de ejercicios.

## Filtros y búsqueda

La colección debe permitir encontrar ejercicios de forma rápida.

Debe poder filtrar por información útil como:

- Tema.
- Dificultad.
- Tipo de ejercicio.
- Lenguaje.
- Conceptos.
- Estado.
- Ruta asociada.
- Disponible o bloqueado.
- Importado o no importado.
- Recomendado o refuerzo.

Los filtros no deben obligar al usuario a entender la estructura interna de Lumen.

El objetivo es que el usuario pueda llegar rápido al ejercicio que necesita.

## Metadata de ejercicios

Cada ejercicio de la colección debe tener metadata suficiente para que Lumen pueda mostrarlo, filtrarlo y decidir qué acciones permite.

La metadata puede incluir:

- Identificador del ejercicio.
- Nombre.
- Descripción corta.
- Tema.
- Dificultad.
- Tipo de ejercicio.
- Lenguaje.
- Conceptos.
- Ruta asociada, si aplica.
- Módulo asociado, si aplica.
- Estado de bloqueo.
- Estado de importación.
- Requisitos de desbloqueo.
- Versión del ejercicio.

Este documento no define el formato exacto del paquete de ejercicio.

La estructura exacta del paquete pertenece al módulo de exercise package.

## Relación con Free Mode

Free Mode usa la colección como entrada principal para buscar e importar ejercicios.

Desde Free Mode, el usuario puede explorar ejercicios disponibles, filtrar por tema y practicar sin seguir una ruta.

Free Mode debe respetar los bloqueos de ejercicios de ruta.

Si un ejercicio de ruta aparece bloqueado en la colección, Free Mode no debe permitir abrirlo ni importarlo.

Si el ejercicio ya fue desbloqueado, Free Mode puede permitir practicarlo, registrando el intento como práctica libre salvo que el sistema de progreso diga otra cosa.

## Relación con Route Mode

Route Mode controla qué ejercicios de ruta se desbloquean.

Cuando el usuario avanza en una ruta, Route Mode debe actualizar el estado de los ejercicios correspondientes.

La colección refleja esos desbloqueos.

Route Mode no depende de que el usuario busque manualmente ejercicios en la colección.

La colección es una vista de disponibilidad.

Route Mode es la experiencia guiada.

## Relación con el Local Engine

La colección depende del Local Engine para operaciones reales.

La UI puede mostrar ejercicios, filtros y botones, pero el Local Engine debe resolver decisiones importantes:

- Consultar ejercicios disponibles.
- Consultar estado de bloqueo.
- Consultar estado de importación.
- Importar ejercicio.
- Validar si un ejercicio puede abrirse.
- Materializar archivos locales.
- Evitar duplicados.
- Consultar metadata local.
- Sincronizar estado con la base local.

La webview muestra.

El Extension Host coordina.

El Local Engine decide y ejecuta.

## Relación con la base de datos local

La base local debe guardar el estado de la colección que afecte al usuario.

Debe recordar ejercicios importados, ejercicios desbloqueados, ejercicios bloqueados por ruta, metadata cacheada y estado mínimo necesario para trabajar offline.

La colección debe poder seguir mostrando ejercicios ya importados aunque no haya internet.

Este documento no define tablas exactas.

La estructura exacta pertenece al módulo de database.

## Relación con la nube

La colección puede alimentarse de una fuente remota.

La nube puede guardar la lista completa de ejercicios, metadata, versiones y paquetes disponibles.

Pero Lumen debe mantener una lógica local-first.

Un ejercicio ya importado debe poder usarse sin internet.

La colección puede necesitar internet para descubrir ejercicios nuevos o actualizar metadata, pero no debe bloquear el trabajo local del usuario con ejercicios ya disponibles.

## Estados principales de la colección

La colección debe manejar estos estados:

- Cargando colección.
- Sin conexión.
- Colección disponible.
- Buscando ejercicios.
- Filtrando ejercicios.
- Ejercicio disponible.
- Ejercicio bloqueado.
- Ejercicio importado.
- Importación en progreso.
- Error de importación.
- Ejercicio desbloqueado por ruta.
- Ejercicio recomendado.
- Refuerzo sugerido.

Cada estado debe tener una respuesta clara en la UI.

## Fallos esperados

La colección debe manejar fallos sin romper el modo actual.

Si no hay internet, debe mostrar ejercicios ya importados y metadata local disponible.

Si falla la importación, debe mostrar un error controlado y permitir intentar de nuevo.

Si un ejercicio ya no existe en la fuente remota, Lumen no debe borrar automáticamente el trabajo local del usuario.

Si un ejercicio está bloqueado, la UI debe explicar por qué está bloqueado y qué ruta o módulo lo desbloquea, si esa información está disponible.

Si hay metadata incompleta, la colección debe degradar de forma segura sin bloquear el resto del sistema.

## Reglas deterministas

La colección usa el término “colección de ejercicios”.

No debe llamarse banco de ejercicios en la documentación nueva.

La colección puede mostrar ejercicios de ruta.

Los ejercicios de ruta bloqueados no pueden abrirse, importarse ni resolverse desde Free Mode.

Los ejercicios de ruta se desbloquean mediante Route Mode.

Un ejercicio desbloqueado puede practicarse desde Free Mode si la regla de progreso lo permite.

Los intentos libres no deben falsear los intentos oficiales de Route Mode.

La colección debe distinguir entre disponible, bloqueado, desbloqueado e importado.

La colección debe funcionar localmente con ejercicios ya importados.

## Resultado esperado

El usuario debe poder entrar a la colección de ejercicios y entender qué puede practicar ahora.

Debe poder buscar ejercicios libres.

Debe poder importar ejercicios disponibles.

Debe poder ver ejercicios de ruta bloqueados sin poder saltárselos.

Debe poder practicar ejercicios de ruta ya desbloqueados si el sistema lo permite.

Debe poder seguir usando ejercicios importados sin depender de internet.

La colección de ejercicios conecta Free Mode y Route Mode sin romper la progresión guiada de Lumen.
