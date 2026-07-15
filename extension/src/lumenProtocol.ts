export const lumenWebviewProtocolVersion = 5;

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
