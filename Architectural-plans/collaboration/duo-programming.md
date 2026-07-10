# Duo Programming

Estado: `future`

## Propósito

Duo Programming permite que dos usuarios trabajen sobre el mismo ejercicio o proyecto en tiempo real.

## Idea central

Ambos participantes comparten un documento lógico, pero cada equipo mantiene su copia local. La colaboración no debe convertir el código en un archivo remoto sin dueño.

## Experiencia

- un usuario crea o acepta una sesión Duo;
- ambos abren el mismo ejercicio compatible;
- ven cursores, selecciones y presencia;
- los cambios aparecen en tiempo real;
- cada participante puede compilar localmente;
- la sesión puede reconectarse sin perder trabajo;
- al finalizar, ambos conservan el resultado local.

## Estados de sesión

- `inviting`
- `joining`
- `syncing`
- `active`
- `reconnecting`
- `conflict`
- `ended`

## Reglas

- Duo no es Race: ambos construyen una solución común.
- Las rutas físicas de archivo pueden ser distintas.
- La identidad del documento se basa en sesión, ejercicio y archivo lógico.
- Los cambios locales deben persistir aunque falle la conexión.
- La compilación ocurre localmente por participante.
- El resultado de una compilación no modifica automáticamente la máquina del otro.
- La sesión debe explicar quién está conectado y quién está editando.

## Conflictos

El sistema debe usar un modelo de edición concurrente capaz de integrar operaciones. Si una recuperación automática no es segura, debe conservar ambas versiones y pedir una resolución explícita.

## Relación con Lumen

- Accounts identifica participantes.
- Realtime transport mantiene presencia y operaciones.
- Local Engine conserva archivos y compilación local.
- Exercise System valida compatibilidad.
- Notifications gestiona invitaciones y reconexiones.

## Privacidad

Solo se comparte el contenido necesario para la sesión. No se comparte el workspace completo, secretos, archivos externos ni historial privado del estudiante.
