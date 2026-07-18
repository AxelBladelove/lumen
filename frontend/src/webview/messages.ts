import type { RoutePathModuleView } from "../route-path-view/types/routePath";

export const lumenWebviewProtocolVersion = 7;

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
  module: {
    routeId: string;
    moduleId: string;
    moduleNumber: number;
    routeTitle: string;
    title: string;
    subtitle: string;
  };
  progress: {
    completed: number;
    total: number;
  };
  nextExercise: { exerciseId: string; title: string } | null;
};

export type ExerciseDetailPayload = {
  exerciseId: string;
  version: string;
  title: string;
  summary: string;
  statementMarkdown: string;
  hints: { order: number; text: string }[];
  status: "active" | "completed";
  nodeType: string;
  primaryTopics: string[];
  difficulty: { band: string; score: number; expectedMinutes: number };
  progress: {
    completed: boolean;
    attempts: { total: number; passed: number; lastRunAt: string | null };
  };
};

export type ExerciseRunKind = "compile" | "test";

export type ExerciseRunStatePayload = {
  active: ExerciseRunKind | null;
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
      payload: {
        token: string | null;
      };
    }
  | {
      type: "frontend.layoutHandoffReady";
      payload: {
        delayMs: number;
        token: string;
      };
    }
  | {
      type: "frontend.layoutCommitArmed";
      payload: {
        token: string;
      };
    }
  | {
      type: "frontend.layoutHandoffPrepared";
      payload: {
        token: string;
      };
    }
  | {
      type: "lumen.exit.requested";
      payload: Record<string, never>;
    }
  | {
      type: "exercise.detail.requested";
      payload: { exerciseId: string };
    }
  | {
      type: "exercise.run.requested";
      payload: { kind: ExerciseRunKind };
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
      type: "lumen.layoutCommitRequested";
      payload: {
        token: string;
      };
    }
  | {
      type: "lumen.layoutHandoffPrepare";
      payload: {
        token: string;
      };
    }
  | {
      type: "lumen.layoutCommitted";
      payload: {
        token: string;
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
    }
  | {
      type: "route.module.data";
      payload: RouteModuleDataPayload;
    }
  | {
      type: "route.activation.state";
      payload: {
        busy: { exerciseId: string } | null;
        error: { exerciseId?: string; message: string } | null;
      };
    }
  | {
      type: "exercise.detail.data";
      payload: {
        source: "engine";
        detail: ExerciseDetailPayload | null;
      };
    }
  | {
      type: "exercise.run.state";
      payload: ExerciseRunStatePayload;
    };
