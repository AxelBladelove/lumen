# Lumen Account and Sync

Estado: `future`

## Propósito

La cuenta Lumen identifica al usuario en funciones que requieren cloud: amigos, Duo, Race, perfiles, leaderboards y sincronización entre dispositivos.

## Principio

Lumen sigue siendo local-first. La cuenta complementa el trabajo local; no convierte cada acción en una dependencia remota.

## Datos de cuenta

- id estable;
- nombre visible;
- avatar;
- email o proveedor de autenticación;
- preferencias de privacidad;
- relaciones sociales;
- rating competitivo;
- dispositivos registrados.

## Qué puede sincronizarse

- progreso resumido de rutas;
- desbloqueos;
- XP, rachas y logros;
- configuración seleccionada;
- relaciones sociales;
- rating y resultados de Race;
- metadata necesaria para continuar en otro dispositivo.

El código fuente y archivos del usuario no se sincronizan por default.

## Conflictos

El estado local nunca debe borrarse silenciosamente. Cuando dos dispositivos avanzan offline, Lumen debe fusionar eventos compatibles y pedir resolución cuando exista conflicto real.

## Reglas

- El usuario puede trabajar offline con ejercicios ya importados.
- La autenticación no bloquea el MVP local.
- No se publica mastery detallado por default.
- La sincronización usa operaciones idempotentes.
- Cerrar sesión no elimina trabajo local.
- El usuario puede solicitar exportación o eliminación de datos cloud.

## Dependencias

Workers API, D1, SQLite local, social, gamification, notifications, Duo y Race.
