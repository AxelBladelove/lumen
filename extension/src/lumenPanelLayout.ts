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
