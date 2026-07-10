# Notifications

Estado: `planned`

## Propósito

Las notificaciones comunican eventos relevantes sin llenar Lumen de ruido.

## Tipos

- recomendación de refuerzo;
- nuevo módulo o proyecto desbloqueado;
- racha u objetivo diario;
- invitación a Duo;
- invitación a Race;
- solicitud de amistad;
- actualización de contenido importado;
- error que requiere acción;
- finalización de operación larga.

## Canales

- mensaje dentro de la webview;
- badge o indicador en Lumen;
- notificación oficial de VS Code;
- notificación del sistema en standalone futuro.

## Reglas

- Elegir el canal menos intrusivo que siga siendo útil.
- No mostrar repetidamente la misma recomendación.
- Una notificación debe llevar a una acción clara.
- Las invitaciones expiran.
- Los eventos se deduplican.
- El usuario controla categorías y frecuencia.
- Los fallos técnicos no deben presentarse como mensajes pedagógicos.

## Prioridad

- `info`
- `actionable`
- `important`
- `urgent`

`urgent` se reserva para riesgo de pérdida de trabajo, seguridad o una sesión activa que requiere respuesta inmediata.

## Estado

- `unread`
- `read`
- `acted`
- `dismissed`
- `expired`

Las notificaciones no son la fuente de verdad del evento; solo representan y enlazan a ese evento.
