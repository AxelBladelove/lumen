import type { RoutePathModuleView } from "../route-path-view/types/routePath";

export const lumenWebviewProtocolVersion = 1;

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
    };
