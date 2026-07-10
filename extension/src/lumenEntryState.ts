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
    workspace: resolveLumenWorkspaceState(),
    phase: "mock-route-path-view"
  };
}

export function resolveLumenWorkspaceState(): LumenEntryState["workspace"] {
  const officialWorkspacePath = path.join(os.homedir(), ".lumen");
  const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const officialWorkspaceExists = fs.existsSync(officialWorkspacePath);
  const isInLumenWorkspace =
    Boolean(currentWorkspacePath) &&
    normalizePath(currentWorkspacePath) === normalizePath(officialWorkspacePath);
  // Escape hatch del repo: Architectural-plans/ identifica el workspace de desarrollo.
  const isDevelopmentWorkspace =
    Boolean(currentWorkspacePath) &&
    fs.existsSync(path.join(currentWorkspacePath ?? "", "Architectural-plans"));
  const isValidLumenWorkspace = isInLumenWorkspace || isDevelopmentWorkspace;

  return {
    officialWorkspacePath,
    currentWorkspacePath,
    officialWorkspaceExists,
    isInLumenWorkspace,
    action: isValidLumenWorkspace
      ? "ready"
      : officialWorkspaceExists
        ? "workspace-switch-pending"
        : "workspace-missing"
  };
}

function normalizePath(value: string | undefined) {
  return path.resolve(value ?? "").toLowerCase();
}
