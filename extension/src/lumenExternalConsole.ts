import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type * as vscode from "vscode";

const externalRunLockPath = path.join(os.tmpdir(), "lumen-external-run.lock");

export function resolveConsoleRunnerPath(context: vscode.ExtensionContext): string {
  return path.resolve(context.extensionUri.fsPath, "bin", "lumen-console-runner.exe");
}

export function isExternalRunActive(): boolean {
  if (!existsSync(externalRunLockPath)) return false;

  let pid: number;
  try {
    const lockContents = readFileSync(externalRunLockPath, "utf8").trim();
    pid = Number(lockContents);
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      removeStaleLock();
      return false;
    }
  } catch {
    removeStaleLock();
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    removeStaleLock();
    return false;
  }
}

export function launchProgram(options: {
  runnerPath: string;
  exePath: string;
  title: string;
}): void {
  launchRunner(
    options.runnerPath,
    path.dirname(options.exePath),
    "run",
    ["--title", options.title, "--lock", externalRunLockPath, options.exePath]
  );
}

export function launchReport(options: {
  runnerPath: string;
  reportPath: string;
  title: string;
  exitCode: number;
}): void {
  launchRunner(
    options.runnerPath,
    path.dirname(options.reportPath),
    "report",
    [
      "--title",
      options.title,
      "--lock",
      externalRunLockPath,
      "--exit-code",
      String(options.exitCode),
      options.reportPath
    ]
  );
}

function launchRunner(
  runnerPath: string,
  workingDir: string,
  mode: "run" | "report",
  args: string[]
): void {
  if (process.platform !== "win32") {
    throw new Error("Lumen currently only launches external consoles on Windows.");
  }

  const runnerArguments = [mode, ...args].map(quoteForCmd).join(" ");
  // `start` treats its first quoted argument as the window title. The nested
  // cmd /c uses the same doubled-quote pattern as the previous external launcher
  // so executable paths containing spaces survive cmd's outer quote stripping.
  const commandLine = `start "" /D ${quoteForCmd(workingDir)} cmd /c ""${runnerPath}" ${runnerArguments}"`;
  const child = spawn("cmd.exe", ["/s", "/c", commandLine], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    windowsVerbatimArguments: true
  });
  child.on("error", () => {
    // A synchronous launch failure is thrown by spawn. There is no caller-owned
    // process lifecycle after detaching, so late launcher errors cannot be acted on.
  });
  child.unref();
}

function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function removeStaleLock(): void {
  try {
    unlinkSync(externalRunLockPath);
  } catch {
    // Another process may already have removed the stale lock.
  }
}
