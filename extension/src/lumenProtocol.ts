export const lumenWebviewProtocolVersion = 7;

export type LumenEntryState = {
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

// Extension Host -> webview
export type LumenRouteModuleDataMessage = {
  type: "route.module.data";
  payload: RouteModuleDataPayload;
};

// Extension Host -> webview
export type LumenExerciseDetailDataMessage = {
  type: "exercise.detail.data";
  payload: {
    source: "engine";
    detail: ExerciseDetailPayload | null;
  };
};

// webview -> Extension Host (intención; el host decide)
export type LumenExerciseDetailRequestedMessage = {
  type: "exercise.detail.requested";
  payload: { exerciseId: string };
};
