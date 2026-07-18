import type { RoutePathNode } from "../types/routePath";

export type MockRouteVisualSlot = {
  pathT: number;
  labelSide: NonNullable<RoutePathNode["labelSide"]>;
  nodeOffset: NonNullable<RoutePathNode["nodeOffset"]>;
  labelOffset: NonNullable<RoutePathNode["labelOffset"]>;
};

/** Scaffolding visual curado de la ruta mock, en su orden aprobado. */
export const mockRouteVisualSlots = [
  {
    pathT: 0,
    labelSide: "right",
    nodeOffset: { x: -10, y: 2 },
    labelOffset: { x: 5, y: -1 }
  },
  {
    pathT: 0.164,
    labelSide: "right",
    nodeOffset: { x: -11, y: 0 },
    labelOffset: { x: 5, y: 0 }
  },
  {
    pathT: 0.359,
    labelSide: "right",
    nodeOffset: { x: -5, y: 7 },
    labelOffset: { x: 9, y: -1 }
  },
  {
    pathT: 0.553,
    labelSide: "right",
    nodeOffset: { x: 0, y: 4 },
    labelOffset: { x: 5, y: 1 }
  },
  {
    pathT: 0.686,
    labelSide: "right",
    nodeOffset: { x: 3, y: 5 },
    labelOffset: { x: 4, y: 1 }
  },
  {
    pathT: 0.858,
    labelSide: "right",
    nodeOffset: { x: -12, y: -1 },
    labelOffset: { x: 8, y: -1 }
  },
  {
    pathT: 0.989,
    labelSide: "right",
    nodeOffset: { x: -1, y: 2 },
    labelOffset: { x: 7, y: 0 }
  }
] as const satisfies readonly MockRouteVisualSlot[];
