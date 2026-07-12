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
// conservan theme, path y encabezados del modulo, y los slots visuales
// (pathT/labelSide/offsets) se reciclan cuando alcanzan; si sobran nodos se
// distribuyen uniformemente sobre la curva.
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

  const completedCount = projectedNodes.filter((node) => node.status === "completed").length;
  const nextNode =
    projectedNodes.find((node) => node.status === "active") ??
    projectedNodes.find((node) => node.status !== "completed");

  return {
    ...base,
    completed: completedCount,
    total: projectedNodes.length,
    percent: projectedNodes.length
      ? Math.round((completedCount / projectedNodes.length) * 100)
      : 0,
    nodes: projectedNodes,
    nextAction: {
      label: "Siguiente:",
      targetTitle: nextNode?.title ?? "Módulo completado"
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
