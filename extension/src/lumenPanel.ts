import * as vscode from "vscode";
import type { LumenEntryState } from "./lumenProtocol";
import { getLumenFrontendHtml, getLumenFrontendResourceRoots } from "./lumenWebviewContent";
import { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";
import { LumenWebviewHost, type LumenModePhase } from "./lumenWebviewHost";

const lumenPanelViewType = "lumen.routePathPanel";

export class LumenPanelController {
  private readonly host: LumenWebviewHost;
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private disposingForExit = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    private readonly onPanelClosed: () => void
  ) {
    this.host = new LumenWebviewHost({
      context,
      outputChannel,
      onExitRequested: () => void vscode.commands.executeCommand("lumen.exitMode"),
      perfViewType: LumenRoutePathViewProvider.viewType
    });
  }

  setPhase(phase: LumenModePhase) {
    this.host.setPhase(phase);
  }

  setEntryState(entryState: LumenEntryState) {
    this.host.setEntryState(entryState);
  }

  async reveal() {
    if (!this.panel) {
      await this.createPanel();
      return;
    }

    this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Beside, true);
    await setLumenEditorLayout();
  }

  async refresh() {
    if (!this.panel) return false;
    this.panel.webview.html = await getLumenFrontendHtml(this.context, this.panel.webview);
    return true;
  }

  async disposeForExit() {
    const panel = this.panel;
    if (!panel) return;

    this.disposingForExit = true;
    try {
      panel.reveal(panel.viewColumn ?? vscode.ViewColumn.Beside, false);
      await executeCommandSafely("workbench.action.closeEditorsInGroup");
      if (this.panel === panel) panel.dispose();
    } finally {
      this.disposingForExit = false;
      await executeCommandSafely("workbench.action.focusLeftGroup");
    }
  }

  private async createPanel() {
    const panel = vscode.window.createWebviewPanel(
      lumenPanelViewType,
      "Lumen",
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: getLumenFrontendResourceRoots(this.context)
      }
    );

    this.panel = panel;
    this.panelDisposables = [];
    this.context.subscriptions.push(panel);

    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "assets", "brand", "lumen-editor-icon.svg");
    this.host.bindWebview(panel.webview, this.panelDisposables);

    panel.onDidDispose(
      () => {
        this.host.unbindWebview(panel.webview);
        this.panelDisposables.forEach((disposable) => disposable.dispose());
        this.panelDisposables = [];
        if (this.panel === panel) this.panel = undefined;
        if (!this.disposingForExit) this.onPanelClosed();
      },
      undefined,
      this.panelDisposables
    );

    panel.webview.html = await getLumenFrontendHtml(this.context, panel.webview);
    await setLumenEditorLayout();
    await lockLumenEditorGroup(panel);
  }
}

async function setLumenEditorLayout() {
  await vscode.commands
    .executeCommand("vscode.setEditorLayout", {
      orientation: 0,
      groups: [{ size: 0.67 }, { size: 0.33 }]
    })
    .then(undefined, () => undefined);
}

async function lockLumenEditorGroup(panel: vscode.WebviewPanel) {
  panel.reveal(panel.viewColumn ?? vscode.ViewColumn.Beside, false);
  await executeCommandSafely("workbench.action.lockEditorGroup");
  await executeCommandSafely("workbench.action.focusLeftGroup");
}

async function executeCommandSafely(command: string) {
  await vscode.commands.executeCommand(command).then(undefined, () => undefined);
}
