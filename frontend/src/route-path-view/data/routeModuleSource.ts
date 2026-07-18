import { mockRouteModule } from "./mockRouteModule";
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

// Proyecta los nodos del engine sobre el scaffolding visual del mock: se
// conservan theme, path y los slots visuales (pathT/labelSide/offsets), que se
// reciclan cuando alcanzan; si sobran nodos se distribuyen uniformemente sobre
// la curva. Metadata, progreso y siguiente ejercicio siguen siendo del engine.
export function buildRouteModuleFromEngine(payload: RouteModuleDataPayload): RoutePathModuleView {
  const base = cloneRouteModule(mockRouteModule);
  const mockNodes = base.nodes;
  const engineNodes = payload.nodes;

  const projectedNodes: RoutePathNode[] = engineNodes.map((engineNode, index) => {
    const scaffold =
      engineNodes.length <= mockNodes.length ? mockNodes[index] : undefined;

    const pathT = scaffold
      ? scaffold.pathT
      : engineNodes.length <= 1
        ? 0
        : index / (engineNodes.length - 1);

    const node: RoutePathNode = {
      id: engineNode.exerciseId,
      title: engineNode.title,
      subtitle: engineNode.primaryTopics.join(" - "),
      type: mapEngineNodeType(engineNode.nodeType),
      status: mapEngineNodeStatus(engineNode.status),
      pathT
    };

    if (scaffold) {
      if (scaffold.labelSide !== undefined) node.labelSide = scaffold.labelSide;
      if (scaffold.nodeOffset) node.nodeOffset = { ...scaffold.nodeOffset };
      if (scaffold.labelOffset) node.labelOffset = { ...scaffold.labelOffset };
    }

    return node;
  });

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
