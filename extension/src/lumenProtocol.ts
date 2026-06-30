export const lumenWebviewProtocolVersion = 1;

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
