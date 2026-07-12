# Local Database

Archivo: `Architectural-plans/database/local-database.md`

## Propósito

`Local Database` define la memoria persistente local de Lumen.

## Estado actual del repo

El Local Engine (`engine/`) crea `lumen.db` (SQLite vía rusqlite bundled) bajo
el globalStorage de la extensión, con migraciones versionadas en transacción
(`schema_migrations`). El schema v5 incluye `user_state`, `settings`, intentos
de compilación, inventario de actividades importadas, intentos de ejercicios y
progreso completado, más `active_exercise` para la working copy autoritativa.
Route Loop v5 reutiliza ese estado para activación y
snapshots secuenciales; errores pedagógicos, gates y catálogo remoto siguen
siendo objetivo.

La extensión además persiste el `bootIntent` mínimo en `context.globalState`
para coordinar la entrada visual; SQLite sigue siendo la autoridad del estado
pedagógico local.

La base de datos local guarda el estado que Lumen necesita recordar entre sesiones: ejercicios importados, ejercicios creados, progreso, intentos, errores, desbloqueos, metadata local y último estado útil del usuario.

La base local no es la UI.

No es el Local Engine.

No es la colección de ejercicios.

No es la nube.

Es la memoria estructurada que permite que Lumen funcione como un producto local-first.

## Qué es la Local Database

La Local Database es una base SQLite local controlada por Lumen.

Debe vivir en el entorno local del usuario y debe poder funcionar sin internet.

Su responsabilidad es guardar datos persistentes del usuario y del estado local de Lumen.

Si el usuario cierra VS Code, reinicia la computadora o vuelve a abrir Lumen otro día, Lumen debe poder recuperar el estado importante desde esta base.

## Tech stack del módulo

Este módulo usa estas tecnologías del tech stack de Lumen:

- **SQLite**: base de datos local default de Lumen. Se usa por estabilidad, madurez, portabilidad, formato de archivo único y funcionamiento embebido.
- **Rust SQLite driver**: usado por el Local Engine para leer y escribir en SQLite desde Rust. La librería concreta puede decidirse en implementación.
- **SQL migrations**: mecanismo para evolucionar la estructura de la base sin destruir datos del usuario.
- **Filesystem local**: la base vive como archivo local dentro del entorno de Lumen.
- **Cloudflare D1 compatibility mindset**: el modelo local debe mantenerse razonablemente compatible con la idea de SQL/SQLite usada en Cloudflare D1 cuando aplique.

Tecnologías que no son default inicial:

- **Cloudflare D1**: no es la base local. D1 pertenece al lado cloud y puede compartir conceptos SQL/SQLite, pero la memoria local del usuario vive en SQLite local.

## Por qué SQLite

SQLite es el default inicial de Lumen porque encaja con el tipo de producto que estamos construyendo.

Lumen necesita una base local que sea simple, embebida, portable, confiable y que no requiera instalar un servidor de base de datos.

La base debe poder vivir como un archivo dentro del entorno local de Lumen.

El usuario no debería tener que configurar credenciales, levantar servicios, instalar PostgreSQL ni entender nada sobre bases de datos.

SQLite permite que Lumen tenga memoria local sin convertir la instalación en algo pesado.

## Qué debe guardar

La Local Database debe guardar el estado que Lumen necesita recordar.

Debe guardar información como:

- Último modo usado.
- Último ejercicio activo.
- Última ruta activa.
- Último módulo activo.
- Ejercicios importados.
- Ejercicios creados por el usuario.
- Ejercicios desbloqueados.
- Ejercicios bloqueados por ruta.
- Estado de la colección de ejercicios.
- Metadata cacheada.
- Intentos de compilación.
- Errores recientes.
- Progreso de rutas.
- Estado mínimo de Free Mode.
- Estado mínimo de Route Mode.
- Configuración local de Lumen.
- Onboarding completado.

No todo tiene que diseñarse como tablas definitivas desde el primer día, pero la base debe estar pensada para soportar esos datos.

## Qué no debe guardar

La Local Database no debe guardar datos temporales de UI que no importan después de cerrar una pantalla.

No debe guardar hovers abiertos.

No debe guardar mini cards cerradas.

No debe guardar estados visuales efímeros.

No debe guardar información sensible innecesaria.

No debe guardar respuestas completas del tutor si no existe una razón clara y una política definida.

No debe usarse como basurero de cualquier estado que la webview no quiera manejar.

La regla es:

```txt
Si el dato ayuda a continuar, auditar progreso, recuperar trabajo o entender errores, puede guardarse.
Si solo pertenece a una interacción visual temporal, no debe guardarse.
```

## Fuente de verdad

La base local es la memoria persistente, pero no decide por sí sola la lógica del producto.

El Local Engine debe ser quien interpreta y modifica esa memoria.

La webview no debe escribir directamente datos importantes.

El Extension Host no debe inventar estado persistente por su cuenta.

La regla de autoridad es:

```txt
Local Database guarda.
Local Engine interpreta.
Extension Host coordina.
Webview muestra.
```

## Relación con Local Engine

El Local Engine es el principal consumidor de la Local Database.

Cuando Lumen necesita consultar estado, importar ejercicios, registrar errores o actualizar progreso, el Local Engine debe leer o escribir en la base.

La base no debe estar manipulada directamente por la webview.

El Local Engine debe proteger la consistencia de los datos.

Si una operación falla, el engine debe devolver un error controlado.

## Relación con Free Mode

Free Mode necesita la base local para recordar ejercicios libres.

La base debe guardar:

- Ejercicios importados en Free Mode.
- Ejercicios creados por el usuario.
- Último ejercicio libre activo.
- Intentos libres.
- Errores de ejercicios libres.
- Estado mínimo para continuar después.

Free Mode no debe perder el trabajo del usuario por cerrar Lumen Mode o reiniciar VS Code.

## Relación con Route Mode

Route Mode necesita la base local para recordar progreso guiado.

La base debe guardar:

- Ruta activa.
- Módulo actual.
- Ejercicio activo de ruta.
- Ejercicios completados.
- Ejercicios desbloqueados.
- Ejercicios bloqueados.
- Gates superados.
- Intentos oficiales de ruta.
- Errores relevantes para progreso.
- Recomendaciones o refuerzos pendientes.

Route Mode depende de una memoria persistente confiable. Sin eso, la ruta no puede saber realmente dónde está el usuario.

## Relación con Exercise Collection

La colección de ejercicios necesita saber qué ejercicios están disponibles, importados, bloqueados o desbloqueados.

La base local debe guardar el estado local de la colección.

Debe poder recordar metadata cacheada para que Lumen pueda seguir mostrando información útil aunque no haya internet.

También debe recordar qué ejercicios de ruta fueron desbloqueados, para que la colección no permita saltarse la progresión.

## Relación con compilación

La base local debe guardar intentos de compilación cuando sean útiles para Lumen.

Un intento puede incluir datos como:

- Ejercicio relacionado.
- Modo donde ocurrió.
- Fecha.
- Resultado.
- Error principal.
- Salida relevante del compilador.
- Archivo relacionado.
- Línea o ubicación, si aplica.

No todos los logs tienen que guardarse completos para siempre.

La política de retención puede definirse más adelante.

La regla actual es que Lumen debe guardar suficiente información para ayudar al usuario y entender su progreso.

## Relación con Ask Tutor

Ask Tutor puede usar información guardada en la base local para construir contexto.

Por ejemplo:

- Errores recientes.
- Intentos anteriores.
- Ejercicio activo.
- Ruta o módulo actual.
- Conceptos asociados.
- Historial mínimo relevante.

La base no debe guardar conversaciones completas del tutor por default si eso no está definido.

Ask Tutor debe usar la base con cuidado y solo para contexto útil.

## Entidades iniciales

La base local debe contemplar entidades como:

- User State.
- Modes.
- Routes.
- Route Progress.
- Exercises.
- Exercise Collection Items.
- Imported Exercises.
- Custom Exercises.
- Exercise Attempts.
- Compile Runs.
- Error Logs.
- Unlocks.
- Settings.
- Catalog Cache.
- Learning Events.
- Skill State.
- Misconception State.
- Recommendation Cache.
- Model Versions.

Esto no significa crear un archivo separado para cada entidad.

Este documento solo define las entidades conceptuales principales.

El significado pedagógico de estas últimas entidades se define en
`Architectural-plans/learning-intelligence/student-model-and-recommendations.md`.

El schema exacto puede implementarse con migraciones cuando el desarrollo empiece.

## Migraciones

La Local Database debe tener migraciones.

Lumen va a evolucionar y la estructura de datos cambiará con el tiempo.

Las migraciones deben permitir actualizar la base sin borrar el progreso del usuario.

Las migraciones deben ser versionadas.

Si una migración falla, Lumen debe reportar un error controlado y evitar corrupción silenciosa.

La base local no debe depender de cambios manuales del usuario.

## Local-first

La Local Database es una parte central del enfoque local-first de Lumen.

El usuario debe poder trabajar sobre ejercicios ya importados sin internet.

Debe poder abrir ejercicios, ver estado, compilar y continuar progreso local.

La nube puede actualizar colección, descargar ejercicios nuevos o sincronizar ciertos datos en el futuro, pero la memoria local no debe depender de conexión para lo básico.

## Compatibilidad con Cloudflare D1

Cloudflare D1 pertenece al lado cloud de Lumen, no al lado local.

Aun así, conviene que el modelo local tenga una mentalidad compatible con SQLite/SQL porque D1 usa semántica SQL de SQLite.

Eso no significa que el schema local y el schema cloud tengan que ser idénticos.

Significa que Lumen debe evitar decisiones locales que vuelvan innecesariamente difícil compartir metadata, migraciones o conceptos entre local y cloud.

## Archivo de base de datos

La base local debe vivir como archivo dentro del entorno local de Lumen.

El nombre exacto puede decidirse en implementación, pero conceptualmente podría ser algo como:

```txt
.lumen/
  data/
    lumen.db
```

La ubicación exacta pertenece al documento de instalación o workspace local.

Este documento solo define que la base debe ser local, persistente y controlada por Lumen.

## Seguridad de datos

La base local debe proteger el trabajo y progreso del usuario.

Lumen no debe borrar progreso, intentos o ejercicios sin una política clara.

Si hay conflictos entre metadata nueva y trabajo local, Lumen debe preferir conservar el trabajo local.

Si la base está corrupta o inconsistente, Lumen debe intentar recuperación segura antes de sugerir reset.

## Fallos esperados

La Local Database debe manejar fallos de forma controlada.

Fallos esperados:

- Base no existe.
- Base no inicializada.
- Migración fallida.
- Archivo bloqueado.
- Permisos insuficientes.
- Corrupción o inconsistencia.
- Datos incompletos.
- Metadata antigua.
- Ejercicio registrado pero carpeta eliminada.

En esos casos, Lumen debe mostrar errores útiles y evitar perder datos sin permiso.

## Reglas deterministas

La base local default es SQLite.

La webview no escribe estado importante directamente.

El Extension Host no inventa persistencia principal.

El Local Engine lee y escribe la base.

La base guarda progreso, ejercicios, intentos, errores, desbloqueos y estado útil.

La base no guarda basura visual temporal.

La base debe poder funcionar sin internet.

La base debe usar migraciones.

La base debe proteger el trabajo del usuario.

## Resultado esperado

La Local Database permite que Lumen recuerde.

Recuerda qué hizo el usuario.

Recuerda qué ejercicios importó.

Recuerda qué ruta está siguiendo.

Recuerda qué ejercicios están bloqueados o desbloqueados.

Recuerda errores e intentos.

Permite cerrar y volver sin empezar desde cero.

El usuario ve continuidad.

Lumen internamente mantiene una memoria local confiable.
