import { describe, expect, test } from "bun:test";

import { buildRouteModuleFromEngine } from "../src/route-path-view/data/routeModuleSource";
import { mockRouteVisualSlots } from "../src/route-path-view/data/mockRouteSlots";
import type { RouteModuleDataPayload } from "../src/webview/messages";

function payload(
  statuses: Array<"active" | "locked" | "completed">,
  options: {
    completed?: number;
    total?: number;
    nextExercise?: { exerciseId: string; title: string } | null;
  } = {}
): RouteModuleDataPayload {
  const activeIndex = statuses.indexOf("active");
  return {
    source: "engine",
    routeId: "c",
    moduleId: "strings",
    activeExerciseId: activeIndex >= 0 ? `exercise-${activeIndex + 1}` : null,
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
    expect(module.activeExerciseId).toBe("exercise-2");
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

  test("proyecta los slots curados desde cero en cada tramo sin recalcular el progreso v7", () => {
    const statuses = [
      "completed",
      "completed",
      "completed",
      "completed",
      "active",
      "locked",
      "locked",
      "locked"
    ] as const;
    const module = buildRouteModuleFromEngine(
      payload([...statuses], {
        completed: 31,
        total: 64,
        nextExercise: { exerciseId: "exercise-5", title: "Quinto ejercicio" }
      })
    );

    expect(module.nodes.map((node) => node.status)).toEqual(statuses);
    expect(module.nodes.slice(0, 5).map((node) => node.pathT)).toEqual(
      [0, 2, 3, 5, 6].map((index) => mockRouteVisualSlots[index].pathT)
    );
    expect(module.nodes.slice(5).map((node) => node.pathT)).toEqual(
      [0, 3, 6].map((index) => mockRouteVisualSlots[index].pathT)
    );
    expect(module.completed).toBe(31);
    expect(module.total).toBe(64);
    expect(module.percent).toBe(48);
    expect(module.nextAction.targetTitle).toBe("Quinto ejercicio");
  });

  test("ordena por orderInModule antes de alinear estado y slot", () => {
    const source = payload(["completed", "active", "locked"]);
    source.nodes = [source.nodes[2], source.nodes[0], source.nodes[1]];

    const module = buildRouteModuleFromEngine(source);

    expect(module.nodes.map((node) => node.id)).toEqual([
      "exercise-1",
      "exercise-2",
      "exercise-3"
    ]);
    expect(module.nodes.map((node) => node.status)).toEqual([
      "completed",
      "active",
      "locked"
    ]);
    expect(module.nodes.map((node) => node.pathT)).toEqual(
      [0, 3, 6].map((index) => mockRouteVisualSlots[index].pathT)
    );
  });
});
