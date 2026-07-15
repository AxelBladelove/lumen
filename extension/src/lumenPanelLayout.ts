/**
 * Confirma el efecto de `moveEditorToRightGroup` sin depender de un resize.
 * Un no-op sólo es válido si Lumen ya estaba en el borde derecho y existe al
 * menos un grupo a su izquierda.
 */
export function isRightGroupMoveConfirmed(
  sourceColumn: number,
  targetColumn: number,
  allColumns: readonly number[]
) {
  if (!Number.isFinite(sourceColumn) || !Number.isFinite(targetColumn)) return false;
  if (targetColumn > sourceColumn) return true;
  if (targetColumn !== sourceColumn) return false;

  const hasGroupToLeft = allColumns.some((column) => column < targetColumn);
  const isRightEdge = allColumns.every((column) => column <= targetColumn);
  return hasGroupToLeft && isRightEdge;
}

/**
 * Ultima barrera sincrona antes de declarar activa una entrada. Las promesas
 * del protocolo son single-assignment: un disposal posterior a `revealed`
 * no puede cambiar su resultado, pero si invalida el token y el panel.
 */
export function isLayoutTransitionActivatable(
  expectedToken: string,
  activeToken: string | undefined,
  panelExists: boolean,
  preparationCompleted: boolean,
  revealCompleted: boolean
) {
  return Boolean(
    expectedToken &&
      expectedToken === activeToken &&
      panelExists &&
      preparationCompleted &&
      revealCompleted
  );
}
