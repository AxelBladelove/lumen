import { describe, expect, test } from "bun:test";

import { createTramoPath } from "../src/route-path-view/path/tramoPaths";
import type { SnakePathConfig } from "../src/route-path-view/types/routePath";

const basePath: SnakePathConfig = {
  id: "route-c-strings",
  pathD: "M 0 0 L 1 1",
  transform: { x: 77, y: 337, scale: 0.576 },
  tubeWidth: 25,
  materialPreset: "liquid-v1"
};

describe("createTramoPath", () => {
  test("genera curvas distintas y estables por índice", () => {
    const first = createTramoPath(basePath, 0);
    const repeated = createTramoPath(basePath, 0);
    const second = createTramoPath(basePath, 1);

    expect(repeated).toBe(first);
    expect(second.pathD).not.toBe(first.pathD);
    expect(second.id).not.toBe(first.id);
  });

  test("conserva transform, ancho y preset visual del snake", () => {
    const path = createTramoPath(basePath, 3);

    expect(path.transform).toEqual(basePath.transform);
    expect(path.tubeWidth).toBe(basePath.tubeWidth);
    expect(path.materialPreset).toBe(basePath.materialPreset);
  });
});
