import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { resolveLumenEntryState } from "./lumenEntryState";
import { lumenWebviewProtocolVersion, type LumenEntryState } from "./lumenProtocol";

type LumenWebviewMessage =
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

export class LumenRoutePathViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "lumen.routePath";

  private view: vscode.WebviewView | undefined;
  private entryState: LumenEntryState | undefined;
  private readonly outputChannel = vscode.window.createOutputChannel("Lumen");

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(this.outputChannel);
  }

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;

    const frontendDistUri = vscode.Uri.joinPath(this.context.extensionUri, "frontend", "dist");
    const brandAssetsUri = vscode.Uri.joinPath(this.context.extensionUri, "assets");

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [frontendDistUri, brandAssetsUri]
    };

    webviewView.webview.onDidReceiveMessage(
      (message: LumenWebviewMessage) => this.handleWebviewMessage(message),
      undefined,
      this.context.subscriptions
    );

    webviewView.webview.html = await this.getHtml(webviewView.webview);

    if (!this.entryState) {
      await vscode.commands.executeCommand("setContext", "lumen.inMode", true);
      await vscode.commands.executeCommand("setContext", "lumen.mode", "route");
      this.setEntryState(resolveLumenEntryState(true));
    }
  }

  async refresh() {
    if (!this.view) {
      await vscode.commands.executeCommand("lumen.open");
      return;
    }

    this.view.webview.html = await this.getHtml(this.view.webview);
  }

  setEntryState(entryState: LumenEntryState) {
    this.entryState = entryState;
    this.postToWebview({
      type: "lumen.entry.state",
      payload: entryState
    });
  }

  private handleWebviewMessage(message: LumenWebviewMessage) {
    if (!message || typeof message.type !== "string") return;

    switch (message.type) {
      case "frontend.ready":
        this.outputChannel.appendLine(
          `Frontend ready: ${message.payload.view} (${message.payload.dataSource}, ${message.payload.moduleId})`
        );
        this.postToWebview({
          type: "extension.ready",
          payload: {
            protocolVersion: lumenWebviewProtocolVersion,
            mode: "mock",
            message: "Lumen Extension Host connected."
          }
        });
        if (this.entryState) {
          this.postToWebview({
            type: "lumen.entry.state",
            payload: this.entryState
          });
        }
        break;

      case "route.node.selected":
        this.outputChannel.appendLine(
          `Route node selected: ${message.payload.nodeId} (${message.payload.status}, ${message.payload.nodeType})`
        );
        break;

      case "route.continue.requested":
        this.outputChannel.appendLine(
          `Route continue requested: ${message.payload.fromNodeId ?? "none"} -> ${
            message.payload.nextNodeId ?? "none"
          }`
        );
        break;
    }
  }

  private postToWebview(message: unknown) {
    this.view?.webview.postMessage(message);
  }

  private async getHtml(webview: vscode.Webview): Promise<string> {
    const frontendDistUri = vscode.Uri.joinPath(this.context.extensionUri, "frontend", "dist");
    const indexUri = vscode.Uri.joinPath(frontendDistUri, "index.html");
    const logoUri = vscode.Uri.joinPath(this.context.extensionUri, "assets", "brand", "lumen-logo.svg");
    const nonce = createNonce();

    try {
      const html = await fs.readFile(indexUri.fsPath, "utf8");
      return this.prepareBuiltFrontendHtml(webview, html, frontendDistUri, logoUri, nonce);
    } catch {
      return this.getMissingBuildHtml(webview, logoUri, nonce);
    }
  }

  private prepareBuiltFrontendHtml(
    webview: vscode.Webview,
    html: string,
    frontendDistUri: vscode.Uri,
    logoUri: vscode.Uri,
    nonce: string
  ) {
    const distBase = withTrailingSlash(webview.asWebviewUri(frontendDistUri).toString());
    const logoWebviewUri = webview.asWebviewUri(logoUri);
    const csp = this.createContentSecurityPolicy(webview, nonce);

    const headInjection = [
      `<base href="${distBase}">`,
      `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
      `<link rel="icon" type="image/svg+xml" href="${logoWebviewUri}">`,
      `<script nonce="${nonce}">window.__LUMEN_WEBVIEW_BOOTSTRAP__={protocolVersion:${lumenWebviewProtocolVersion},mode:"mock"};</script>`
    ].join("\n");

    return html
      .replace(/<script\b(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)
      .replace(/<head>/i, `<head>\n${headInjection}`);
  }

  private getMissingBuildHtml(webview: vscode.Webview, logoUri: vscode.Uri, nonce: string) {
    const logoWebviewUri = webview.asWebviewUri(logoUri);
    const csp = this.createContentSecurityPolicy(webview, nonce);

    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/svg+xml" href="${logoWebviewUri}">
    <title>Lumen</title>
    <style>
      body {
        display: grid;
        min-height: 100vh;
        margin: 0;
        place-items: center;
        color: #dff8ff;
        background: #02070b;
        font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(340px, calc(100vw - 40px));
        text-align: center;
      }
      img {
        width: 58px;
        height: auto;
        margin-bottom: 18px;
      }
      code {
        color: #80d8ff;
      }
    </style>
  </head>
  <body>
    <main>
      <img src="${logoWebviewUri}" alt="Lumen">
      <h1>Lumen</h1>
      <p>El frontend todavía no está compilado. Ejecuta <code>bun run build</code> en la raíz del repo y vuelve a abrir Lumen.</p>
    </main>
  </body>
</html>`;
  }

  private createContentSecurityPolicy(webview: vscode.Webview, nonce: string) {
    return [
      "default-src 'none'",
      `img-src ${webview.cspSource} data: blob:`,
      `font-src ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
      `connect-src ${webview.cspSource}`,
      "worker-src blob:"
    ].join("; ");
  }
}

function createNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
