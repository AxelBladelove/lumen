import { describe, expect, test } from "bun:test";

import { buildRouteModuleFromEngine } from "../src/route-path-view/data/routeModuleSource";
import type { RouteModuleDataPayload } from "../src/webview/messages";

function payload(statuses: Array<"active" | "locked" | "completed">): RouteModuleDataPayload {
  return {
    source: "engine",
    routeId: "c",
    moduleId: "strings",
    activeExerciseId: statuses.includes("active") ? "exercise-2" : null,
    nodes: statuses.map((status, index) => ({
      exerciseId: `exercise-${index + 1}`,
      title: `Ejercicio ${index + 1}`,
      primaryTopics: ["strings"],
      nodeType: "exercise",
      orderInModule: index + 1,
      status
    }))
  };
}

describe("buildRouteModuleFromEngine", () => {
  test("preserva exactamente los estados autoritativos del engine", () => {
    const module = buildRouteModuleFromEngine(payload(["completed", "active", "locked"]));
    expect(module.nodes.map((node) => node.status)).toEqual(["completed", "active", "locked"]);
    expect(module.completed).toBe(1);
    expect(module.percent).toBe(33);
    expect(module.nextAction.targetTitle).toBe("Ejercicio 2");
  });

  test("un módulo completado no inventa un nuevo nodo activo", () => {
    const module = buildRouteModuleFromEngine(payload(["completed", "completed"]));
    expect(module.nodes.every((node) => node.status === "completed")).toBe(true);
    expect(module.completed).toBe(2);
    expect(module.percent).toBe(100);
    expect(module.nextAction.targetTitle).toBe("Módulo completado");
  });
});
