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
export function partitionModuleNodes<T>(nodes: readonly T[]): T[][] {
  const tramos: T[][] = [];
  let cursor = 0;

  while (nodes.length - cursor > 7) {
    const remaining = nodes.length - cursor;
    const tailAfterSix = remaining - 6;
    const take = tailAfterSix === 1 || tailAfterSix === 2 ? 5 : 6;

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

/** Crea slots locales con aire en ambos extremos de la curva. */
export function createTramoVisualSlots(
  nodeCount: number,
  tramoIndex: number
): TramoVisualSlot[] {
  if (nodeCount <= 0) return [];

  const seed = normalizeSeed(tramoIndex);
  const start = 0.09 + signedUnit(seed + 11) * 0.012;
  const end = 0.91 + signedUnit(seed + 29) * 0.012;

  return Array.from({ length: nodeCount }, (_, index) => {
    const pathT =
      nodeCount === 1 ? 0.5 : start + (index / (nodeCount - 1)) * (end - start);
    // El snake vive en la franja izquierda del stage de referencia; reservar
    // los labels a la derecha evita recortes y conserva su lectura original.
    const labelSide = "right" as const;
    const horizontalSign = 1;
    const drift = Math.round(signedUnit(seed * 13 + index * 17) * 4);
    const lift = Math.round(signedUnit(seed * 19 + index * 23) * 3);

    return {
      pathT,
      labelSide,
      nodeOffset: {
        x: horizontalSign * (2 + Math.abs(drift)),
        y: lift
      },
      labelOffset: {
        x: horizontalSign * (6 + Math.abs(drift)),
        y: Math.round(signedUnit(seed * 31 + index * 7) * 2)
      }
    };
  });
}

/**
 * Aplica slots locales a todos los tramos sin alterar metadata ni estado de
 * cada nodo. La semilla es el índice del tramo, nunca aleatoriedad de runtime.
 */
export function projectModuleNodes<T extends RoutePathNode>(nodes: readonly T[]): T[] {
  return partitionModuleNodes(nodes).flatMap((tramo, tramoIndex) => {
    const slots = createTramoVisualSlots(tramo.length, tramoIndex);

    return tramo.map((node, index) => ({
      ...node,
      ...slots[index],
      nodeOffset: { ...slots[index].nodeOffset },
      labelOffset: { ...slots[index].labelOffset }
    }));
  });
}

function normalizeSeed(value: number): number {
  return Math.abs(Math.trunc(value)) + 1;
}

// Hash entero pequeño y estable en [-1, 1], suficiente para microvariaciones.
function signedUnit(value: number): number {
  let hash = value | 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}
