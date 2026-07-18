import { describe, expect, test } from "bun:test";

import {
  createTramoVisualSlots,
  partitionModuleNodes,
  projectModuleNodes,
  selectVisibleTramoIndex
} from "../src/route-path-view/state/moduleTramos";
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
  test("aplica slots locales generosos por tramo y preserva metadata y estados", () => {
    const source = nodes(8);
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

    for (const tramo of [first, second]) {
      expect(tramo[0].pathT).toBeGreaterThan(0.07);
      expect(tramo.at(-1)?.pathT).toBeLessThan(0.93);
      expect(tramo.every((node, index) => index === 0 || node.pathT > tramo[index - 1].pathT)).toBe(true);
      expect(tramo.every((node) => node.labelSide !== undefined)).toBe(true);
      expect(tramo.every((node) => node.nodeOffset !== undefined)).toBe(true);
      expect(tramo.every((node) => node.labelOffset !== undefined)).toBe(true);
    }
  });

  test("los slots son deterministas y varían por índice de tramo", () => {
    expect(createTramoVisualSlots(5, 2)).toEqual(createTramoVisualSlots(5, 2));
    expect(createTramoVisualSlots(5, 2)).not.toEqual(createTramoVisualSlots(5, 3));
  });
});
