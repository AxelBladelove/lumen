# Decision 0002: Installed Content and Working Copies

Estado: `accepted`

## Contexto

Los paquetes `.esex` contienen tanto material editable de inicio como el
manifest y los tests que definen el ejercicio. Ejecutar y editar directamente
la instalación mezcla contenido confiable con trabajo del estudiante: una
actualización puede borrar la solución y una edición accidental puede alterar
el contrato de evaluación.

## Decisión

Separar dos áreas:

1. El `.esex` validado se instala como contenido inmutable.
2. El estudiante trabaja en una copia editable identificada por
   `activityId + version + mode` bajo
   `~/.lumen/workspaces/{mode}/{activityId}/{version}`.

La materialización es idempotente. Crea el starter cuando la working copy no
existe y nunca sobrescribe archivos ya presentes. No habrá reset implícito;
un reset futuro deberá ser una acción explícita.

Compilar y probar usa el source de la working copy. El manifest, los hints y
los tests siguen resolviéndose desde la instalación inmutable verificada.

## Alternativas descartadas

- Editar dentro del paquete instalado: permite corrupción y pérdida de trabajo
  al actualizar.
- Una sola copia por `activityId`: mezcla modos y versiones incompatibles.
- Reponer el starter en cada activación: destruye cambios válidos del usuario.
- Copiar tests a la working copy: hace editable la fuente del veredicto.

## Consecuencias

- Reabrir un ejercicio conserva exactamente el trabajo anterior.
- Route Mode y Free Mode pueden mantener soluciones independientes.
- Cada versión conserva su propio trabajo y puede coexistir con otras.
- El engine debe resolver conjuntamente working copy e instalación antes de
  compilar o probar.
- Reset, migración entre versiones y garbage collection requieren decisiones
  y UX explícitas posteriores.
