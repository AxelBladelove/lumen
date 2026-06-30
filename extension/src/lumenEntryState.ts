import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { lumenWebviewProtocolVersion, type LumenEntryState } from "./lumenProtocol";

export function resolveLumenEntryState(inMode = true): LumenEntryState {
  return {
    protocolVersion: lumenWebviewProtocolVersion,
    inMode,
    mode: "route",
    workspace: resolveWorkspaceState(),
    phase: "mock-route-path-view"
  };
}

function resolveWorkspaceState(): LumenEntryState["workspace"] {
  const officialWorkspacePath = path.join(os.homedir(), ".lumen");
  const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const officialWorkspaceExists = fs.existsSync(officialWorkspacePath);
  const isInLumenWorkspace =
    Boolean(currentWorkspacePath) &&
    normalizePath(currentWorkspacePath) === normalizePath(officialWorkspacePath);

  return {
    officialWorkspacePath,
    currentWorkspacePath,
    officialWorkspaceExists,
    isInLumenWorkspace,
    action: isInLumenWorkspace
      ? "ready"
      : officialWorkspaceExists
        ? "workspace-switch-pending"
        : "workspace-missing"
  };
}

function normalizePath(value: string | undefined) {
  return path.resolve(value ?? "").toLowerCase();
}
