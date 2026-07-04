import * as vscode from "vscode";
import type { LumenModePhase } from "./lumenWebviewHost";

/**
 * Launcher liviano del Activity Bar. VS Code abre esta vista al clickear el
 * icono de Lumen; la extension la cierra de inmediato y arranca Lumen Mode.
 * La UI real vive en un WebviewPanel de editor para evitar el header nativo
 * del sidebar.
 */
export class LumenRoutePathViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "lumen.routePath";

  private phase: LumenModePhase = "idle";

  constructor(private readonly onLaunchRequested: () => void) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    webviewView.title = " ";
    webviewView.description = "";
    webviewView.webview.options = {
      enableScripts: false
    };

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.maybeAutoEnter();
    });

    webviewView.webview.html = getLauncherHtml();
    this.maybeAutoEnter();
  }

  setPhase(phase: LumenModePhase) {
    this.phase = phase;
  }

  private maybeAutoEnter() {
    if (this.phase !== "idle") return;
    void vscode.commands.executeCommand("workbench.action.closeSidebar");
    this.onLaunchRequested();
  }
}

function getLauncherHtml() {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lumen</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }
    </style>
  </head>
  <body></body>
</html>`;
}
