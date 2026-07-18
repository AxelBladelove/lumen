import { describe, expect, test } from "bun:test";

import { buildRouteModuleFromEngine } from "../src/route-path-view/data/routeModuleSource";
import type { RouteModuleDataPayload } from "../src/webview/messages";

function payload(
  statuses: Array<"active" | "locked" | "completed">,
  options: {
    completed?: number;
    total?: number;
    nextExercise?: { exerciseId: string; title: string } | null;
  } = {}
): RouteModuleDataPayload {
  return {
    source: "engine",
    routeId: "c",
    moduleId: "strings",
    activeExerciseId: statuses.includes("active") ? "exercise-2" : null,
    module: {
      routeId: "c",
      moduleId: "strings",
      moduleNumber: 7,
      routeTitle: "Ruta autoritativa",
      title: "Metadata del engine",
      subtitle: "Sin encabezados del mock"
    },
    progress: {
      completed: options.completed ?? 5,
      total: options.total ?? 8
    },
    nextExercise:
      options.nextExercise === undefined
        ? { exerciseId: "exercise-next", title: "Siguiente autoritativo" }
        : options.nextExercise,
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
  test("proyecta metadata, progreso y siguiente ejercicio autoritativos", () => {
    const module = buildRouteModuleFromEngine(payload(["completed", "active", "locked"]));

    expect(module.routeTitle).toBe("Ruta autoritativa");
    expect(module.moduleNumber).toBe(7);
    expect(module.title).toBe("Metadata del engine");
    expect(module.subtitle).toBe("Sin encabezados del mock");
    expect(module.nodes.map((node) => node.status)).toEqual(["completed", "active", "locked"]);
    expect(module.completed).toBe(5);
    expect(module.total).toBe(8);
    expect(module.percent).toBe(63);
    expect(module.nextAction.targetTitle).toBe("Siguiente autoritativo");
  });

  test("un módulo completado no inventa un nuevo nodo activo", () => {
    const module = buildRouteModuleFromEngine(
      payload(["completed", "completed"], {
        completed: 64,
        total: 64,
        nextExercise: null
      })
    );

    expect(module.nodes.every((node) => node.status === "completed")).toBe(true);
    expect(module.completed).toBe(64);
    expect(module.percent).toBe(100);
    expect(module.nextAction.targetTitle).toBe("Módulo completado");
  });
});
