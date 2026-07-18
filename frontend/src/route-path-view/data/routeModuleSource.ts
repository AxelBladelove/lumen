import { mockRouteModule } from "./mockRouteModule";
import { projectModuleNodes } from "../state/moduleTramos";
import type { NodeStatus, NodeType, RoutePathModuleView, RoutePathNode } from "../types/routePath";
import type { RouteModuleDataPayload } from "../../webview/messages";

export const routeModuleDataSource = "mock:route-c-module-2-strings";

export function engineRouteModuleDataSource(routeId: string, moduleId: string) {
  return `engine:${routeId}/${moduleId}`;
}

export function createInitialRouteModule() {
  return cloneRouteModule(mockRouteModule);
}

export function cloneRouteModule(module: RoutePathModuleView): RoutePathModuleView {
  if (typeof structuredClone === "function") {
    return structuredClone(module);
  }

  return JSON.parse(JSON.stringify(module)) as RoutePathModuleView;
}

// Metadata, progreso y siguiente ejercicio siguen siendo del engine. Solo la
// ubicación visual se proyecta en slots locales deterministas por tramo.
export function buildRouteModuleFromEngine(payload: RouteModuleDataPayload): RoutePathModuleView {
  const base = cloneRouteModule(mockRouteModule);
  // `orderInModule` es la autoridad semántica. No dependemos del orden de
  // serialización del snapshot: así estado y slot nunca se desacoplan si un
  // productor entrega el array en otro orden.
  const engineNodes = payload.nodes
    .map((node, sourceIndex) => ({ node, sourceIndex }))
    .sort((left, right) => {
      const leftOrder = left.node.orderInModule;
      const rightOrder = right.node.orderInModule;

      if (leftOrder === null && rightOrder !== null) return 1;
      if (leftOrder !== null && rightOrder === null) return -1;
      if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ node }) => node);

  const routeNodes: RoutePathNode[] = engineNodes.map((engineNode) => {
    return {
      id: engineNode.exerciseId,
      title: engineNode.title,
      subtitle: engineNode.primaryTopics.join(" - "),
      type: mapEngineNodeType(engineNode.nodeType),
      status: mapEngineNodeStatus(engineNode.status),
      pathT: 0.5
    };
  });
  const projectedNodes = projectModuleNodes(routeNodes);

  const { completed, total } = payload.progress;

  return {
    ...base,
    routeTitle: payload.module.routeTitle,
    moduleNumber: payload.module.moduleNumber,
    title: payload.module.title,
    subtitle: payload.module.subtitle,
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    activeExerciseId: payload.activeExerciseId,
    nodes: projectedNodes,
    nextAction: {
      label: "Siguiente:",
      targetTitle: payload.nextExercise?.title ?? "Módulo completado"
    }
  };
}

function mapEngineNodeType(nodeType: string): NodeType {
  switch (nodeType) {
    case "lesson":
      return "exercise";
    case "challenge":
      return "challenge";
    case "quiz":
      return "quiz";
    case "project":
      return "project";
    default:
      return "exercise";
  }
}

function mapEngineNodeStatus(status: string): NodeStatus {
  switch (status) {
    case "active":
      return "active";
    case "completed":
      return "completed";
    default:
      return "locked";
  }
}
