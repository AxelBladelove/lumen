import type { RoutePathModuleView } from "../route-path-view/types/routePath";

export const lumenWebviewProtocolVersion = 1;

export type RouteModuleDataNodeStatus = "active" | "locked" | "completed";

export type RouteModuleDataNode = {
  exerciseId: string;
  title: string;
  primaryTopics: string[];
  nodeType: string;
  orderInModule: number | null;
  status: RouteModuleDataNodeStatus;
};

export type RouteModuleDataPayload = {
  source: "engine";
  routeId: string;
  moduleId: string;
  activeExerciseId: string | null;
  nodes: RouteModuleDataNode[];
};

export type WebviewToExtensionMessage =
  | {
      type: "frontend.ready";
      payload: {
        protocolVersion: number;
        view: "route-path-view";
        routeId: string;
        moduleId: string;
        dataSource: string;
      };
    }
  | {
      type: "route.node.selected";
      payload: {
        nodeId: string;
        status: string;
        nodeType: string;
      };
    }
  | {
      type: "route.continue.requested";
      payload: {
        fromNodeId?: string;
        nextNodeId?: string;
      };
    }
  | {
      type: "frontend.revealed";
      payload: Record<string, never>;
    }
  | {
      type: "frontend.loadingComplete";
      payload: Record<string, never>;
    }
  | {
      type: "lumen.exit.requested";
      payload: Record<string, never>;
    }
  | {
      type: "perf.report";
      payload: {
        label: string;
        navigation: {
          domContentLoadedMs: number | null;
          loadMs: number | null;
        };
        marks: Record<string, number>;
        measures?: Record<string, number>;
        frameStats?: {
          frames: number;
          avgFrameMs: number | null;
          p95FrameMs: number | null;
          maxFrameMs: number | null;
          overBudgetFrames: number;
        };
        webglStats?: Record<string, unknown> | null;
        routePresent: boolean;
        canvasPresent: boolean;
        nodeCount: number;
        visibilityState: string;
        hasFocus: boolean;
      };
    };

export type ExtensionToWebviewMessage =
  | {
      type: "extension.ready";
      payload: {
        protocolVersion: number;
        mode: "mock";
        message: string;
      };
    }
  | {
      type: "lumen.entry.state";
      payload: {
        protocolVersion: number;
        inMode: boolean;
        mode: "route";
        phase: "mock-route-path-view";
        workspace: {
          officialWorkspacePath: string;
          currentWorkspacePath?: string;
          officialWorkspaceExists: boolean;
          isInLumenWorkspace: boolean;
          action: "ready" | "workspace-switch-pending" | "workspace-missing";
        };
      };
    }
  | {
      type: "lumen.entry.transition";
      payload: {
        phase: "entering" | "active";
      };
    }
  | {
      type: "lumen.reveal";
      payload: Record<string, never>;
    }
  | {
      type: "route.module.snapshot";
      payload: {
        source: "mock" | "engine";
        module: RoutePathModuleView;
      };
    }
  | {
      type: "route.exercise.completed";
      payload: {
        nodeId?: string;
      };
    }
  | {
      type: "route.module.data";
      payload: RouteModuleDataPayload;
    };
