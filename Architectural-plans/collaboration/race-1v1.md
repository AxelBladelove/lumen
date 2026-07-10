# Race 1v1

Estado: `future`

## Propósito

Race permite que dos usuarios resuelvan el mismo reto por separado y compitan bajo condiciones equivalentes.

## Idea central

Duo comparte una solución. Race compara dos soluciones independientes.

## Flujo

1. Un usuario invita a otro o entra a matchmaking.
2. Ambos reciben el mismo ejercicio y versión.
3. Lumen verifica toolchain y disponibilidad local.
4. Se sincroniza un countdown.
5. Cada participante programa en su propia copia local.
6. Los intentos se validan con el mismo contrato de tests.
7. Gana el primero que supera todos los criterios válidos.
8. Se muestran resultados y se actualiza rating cuando corresponda.

## Estados

- `waiting`
- `ready_check`
- `countdown`
- `running`
- `submitted`
- `finished`
- `aborted`
- `disputed`

## Reglas de justicia

- misma versión del ejercicio;
- mismos tests y límites;
- reloj autoritativo de sesión;
- resultado basado en validación, no en un botón de “terminé”;
- reconexiones con una ventana limitada;
- abandono y desconexión tienen resultados distintos;
- hints, si se permiten, deben afectar el modo o rating de forma explícita.

## ELO y modos

Puede haber carreras casuales y clasificatorias. Solo las clasificatorias actualizan ELO. El rating debe usar resultados válidos y protegerse de partidas duplicadas, colusión y abandonos repetidos.

## Privacidad

Durante la carrera no se comparte el código del rival. Después puede existir comparación o replay solo cuando la política de la sesión lo permita.

## Dependencias

Accounts, friends, notifications, realtime, Exercise System, solution testing y leaderboards.
