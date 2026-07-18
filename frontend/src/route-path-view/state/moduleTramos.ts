import { mockRouteVisualSlots } from "../data/mockRouteSlots";
import type { RoutePathNode } from "../types/routePath";

export type TramoVisualSlot = {
  pathT: number;
  labelSide: NonNullable<RoutePathNode["labelSide"]>;
  nodeOffset: NonNullable<RoutePathNode["nodeOffset"]>;
  labelOffset: NonNullable<RoutePathNode["labelOffset"]>;
};

/**
 * Parte el módulo en tramos estables y conserva el orden original.
 *
 * Regla: mientras queden más de siete nodos se toman seis; si tomar seis
 * dejaría uno o dos nodos, se toman cinco. Así el resto final siempre queda
 * entre tres y siete. Los módulos de uno o dos nodos son la única excepción y
 * se mantienen indivisibles.
 */
export function partitionModuleNodes<T>(nodes: readonly T[], preferredSize = 6): T[][] {
  const tramos: T[][] = [];
  let cursor = 0;

  while (nodes.length - cursor > preferredSize + 1) {
    const remaining = nodes.length - cursor;
    const tailAfterTake = remaining - preferredSize;
    const take = tailAfterTake === 1 || tailAfterTake === 2 ? preferredSize - 1 : preferredSize;

    tramos.push(nodes.slice(cursor, cursor + take));
    cursor += take;
  }

  if (cursor < nodes.length) {
    tramos.push(nodes.slice(cursor));
  }

  return tramos;
}

/**
 * Selecciona el tramo autoritativo sin inferir progreso desde los estados de
 * los nodos. Un id ausente o desconocido cae al primer tramo; el cierre del
 * módulo siempre muestra el último.
 */
export function selectVisibleTramoIndex<T extends { id: string }>(
  tramos: readonly (readonly T[])[],
  activeExerciseId: string | null | undefined,
  moduleCompleted: boolean
): number {
  if (tramos.length === 0) return 0;
  if (moduleCompleted) return tramos.length - 1;
  if (!activeExerciseId) return 0;

  const index = tramos.findIndex((tramo) =>
    tramo.some((node) => node.id === activeExerciseId)
  );

  return index >= 0 ? index : 0;
}

/**
 * Recicla por tramo el scaffolding curado del mock. Los tramos cortos
 * submuestrean la secuencia completa para conservar siempre los slots de
 * inicio y fin; un tramo excepcionalmente mayor sólo distribuye de forma
 * uniforme los nodos que exceden ese patrón.
 */
export function createTramoVisualSlots(
  nodeCount: number,
  _tramoIndex: number
): TramoVisualSlot[] {
  if (nodeCount <= 0) return [];

  const curatedSlotCount = mockRouteVisualSlots.length;
  if (nodeCount <= curatedSlotCount) {
    if (nodeCount === 1) return [cloneSlot(mockRouteVisualSlots[0])];

    return Array.from({ length: nodeCount }, (_, nodeIndex) => {
      const curatedIndex = Math.round(
        (nodeIndex * (curatedSlotCount - 1)) / (nodeCount - 1)
      );
      return cloneSlot(mockRouteVisualSlots[curatedIndex]);
    });
  }

  const slots = mockRouteVisualSlots.map(cloneSlot);
  const overflowCount = nodeCount - curatedSlotCount;
  const lastCuratedSlot = mockRouteVisualSlots.at(-1);

  if (overflowCount <= 0 || !lastCuratedSlot) return slots;

  for (let overflowIndex = 0; overflowIndex < overflowCount; overflowIndex += 1) {
    slots.push({
      pathT:
        lastCuratedSlot.pathT +
        ((overflowIndex + 1) / overflowCount) * (1 - lastCuratedSlot.pathT),
      labelSide: lastCuratedSlot.labelSide,
      nodeOffset: { ...lastCuratedSlot.nodeOffset },
      labelOffset: { ...lastCuratedSlot.labelOffset }
    });
  }

  return slots;
}

/**
 * Aplica a cada tramo la misma secuencia local de slots, sin alterar metadata
 * ni estado de los nodos.
 */
export function projectModuleNodes<T extends RoutePathNode>(
  nodes: readonly T[],
  preferredSize?: number
): T[] {
  return partitionModuleNodes(nodes, preferredSize).flatMap((tramo, tramoIndex) => {
    const slots = createTramoVisualSlots(tramo.length, tramoIndex);

    return tramo.map((node, index) => ({
      ...node,
      ...slots[index],
      nodeOffset: { ...slots[index].nodeOffset },
      labelOffset: { ...slots[index].labelOffset }
    }));
  });
}

function cloneSlot(slot: TramoVisualSlot): TramoVisualSlot {
  return {
    ...slot,
    nodeOffset: { ...slot.nodeOffset },
    labelOffset: { ...slot.labelOffset }
  };
}
