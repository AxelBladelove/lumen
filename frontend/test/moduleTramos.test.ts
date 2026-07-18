import { describe, expect, test } from "bun:test";

import {
  createTramoVisualSlots,
  partitionModuleNodes,
  projectModuleNodes,
  selectVisibleTramoIndex
} from "../src/route-path-view/state/moduleTramos";
import { mockRouteVisualSlots } from "../src/route-path-view/data/mockRouteSlots";
import type { RoutePathNode } from "../src/route-path-view/types/routePath";

function nodes(count: number): RoutePathNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `exercise-${index + 1}`,
    title: `Ejercicio ${index + 1}`,
    subtitle: `Tema ${index + 1}`,
    type: index % 2 === 0 ? "exercise" : "challenge",
    status: index === 3 ? "active" : index < 3 ? "completed" : "locked",
    pathT: 0,
    reviewMode: index === 0 ? "repeat" : undefined
  }));
}

describe("partitionModuleNodes", () => {
  test.each([
    [8, [5, 3]],
    [12, [6, 6]],
    [13, [6, 7]],
    [64, [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 4]]
  ] as const)("parte %i nodos con tamaños deterministas", (count, expected) => {
    const tramos = partitionModuleNodes(nodes(count));

    expect(tramos.map((tramo) => tramo.length)).toEqual(expected);
    expect(tramos.flat().map((node) => node.id)).toEqual(
      nodes(count).map((node) => node.id)
    );
  });

  test("mantiene el último tramo entre tres y siete salvo módulos indivisibles", () => {
    for (let count = 3; count <= 80; count += 1) {
      const sizes = partitionModuleNodes(nodes(count)).map((tramo) => tramo.length);

      expect(sizes.every((size) => size >= 3 && size <= 7)).toBe(true);
      expect(sizes.at(-1)).toBeGreaterThanOrEqual(3);
    }

    expect(partitionModuleNodes(nodes(1)).map((tramo) => tramo.length)).toEqual([1]);
    expect(partitionModuleNodes(nodes(2)).map((tramo) => tramo.length)).toEqual([2]);
  });
});

describe("selectVisibleTramoIndex", () => {
  const tramos = partitionModuleNodes(nodes(13));

  test("selecciona el tramo que contiene el ejercicio activo", () => {
    expect(selectVisibleTramoIndex(tramos, "exercise-8", false)).toBe(1);
  });

  test("un módulo completo muestra el último tramo", () => {
    expect(selectVisibleTramoIndex(tramos, null, true)).toBe(1);
  });

  test("un id ausente o desconocido cae al primer tramo", () => {
    expect(selectVisibleTramoIndex(tramos, null, false)).toBe(0);
    expect(selectVisibleTramoIndex(tramos, "exercise-inexistente", false)).toBe(0);
  });
});

describe("projectModuleNodes", () => {
  test("reinicia en cada tramo una subsecuencia curada que cubre ambos extremos", () => {
    const source = nodes(13);
    const projected = projectModuleNodes(source);
    const [first, second] = partitionModuleNodes(projected);

    expect(projected.map(({ id, title, subtitle, type, status, reviewMode }) => ({
      id,
      title,
      subtitle,
      type,
      status,
      reviewMode
    }))).toEqual(source.map(({ id, title, subtitle, type, status, reviewMode }) => ({
      id,
      title,
      subtitle,
      type,
      status,
      reviewMode
    })));

    expect([first, second].map((tramo) =>
      tramo.map(({ pathT, labelSide, nodeOffset, labelOffset }) => ({
        pathT,
        labelSide,
        nodeOffset,
        labelOffset
      }))
    )).toEqual([
      [0, 1, 2, 4, 5, 6].map((index) => mockRouteVisualSlots[index]),
      mockRouteVisualSlots
    ]);
  });

  test.each([
    [3, [0, 3, 6]],
    [4, [0, 2, 4, 6]],
    [5, [0, 2, 3, 5, 6]],
    [6, [0, 1, 2, 4, 5, 6]],
    [7, [0, 1, 2, 3, 4, 5, 6]]
  ] as const)("%i nodos submuestrean slots en orden y cubren inicio y fin", (count, indices) => {
    expect(createTramoVisualSlots(count, 0)).toEqual(
      indices.map((index) => mockRouteVisualSlots[index])
    );
  });

  test("conserva orden y estados alineados con pathT ascendente", () => {
    const statuses = ["completed", "completed", "active", "locked", "locked"] as const;
    const source = nodes(statuses.length).map((node, index) => ({
      ...node,
      status: statuses[index]
    }));
    const projected = projectModuleNodes(source);

    expect(projected.map((node) => node.id)).toEqual(source.map((node) => node.id));
    expect(projected.map((node) => node.status)).toEqual(statuses);
    expect(projected.map((node) => node.pathT)).toEqual(
      [...projected].map((node) => node.pathT).sort((left, right) => left - right)
    );
  });

  test("los slots curados no dependen del índice de tramo", () => {
    expect(createTramoVisualSlots(5, 2)).toEqual(createTramoVisualSlots(5, 2));
    expect(createTramoVisualSlots(5, 2)).toEqual(createTramoVisualSlots(5, 3));
  });

  test("sólo el excedente de siete slots usa distribución uniforme", () => {
    const slots = createTramoVisualSlots(9, 0);

    expect(slots.slice(0, 7)).toEqual(mockRouteVisualSlots);
    expect(slots[7].pathT).toBeCloseTo(0.9945, 8);
    expect(slots[8].pathT).toBe(1);
  });
});
