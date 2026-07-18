import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { lumenWebviewProtocolVersion } from "./lumenProtocol";

export function getLumenFrontendResourceRoots(context: vscode.ExtensionContext) {
  return [
    vscode.Uri.joinPath(context.extensionUri, "frontend", "dist"),
    vscode.Uri.joinPath(context.extensionUri, "assets")
  ];
}

/**
 * Lee el index.html compilado del frontend por adelantado. Permite crear el
 * panel y asignarle el HTML en el mismo turno (sin awaits entre medio), que es
 * lo que evita frames intermedios visibles durante la entrada a Lumen Mode.
 */
export async function readLumenFrontendIndexHtml(context: vscode.ExtensionContext) {
  const indexUri = vscode.Uri.joinPath(context.extensionUri, "frontend", "dist", "index.html");
  try {
    return await fs.readFile(indexUri.fsPath, "utf8");
  } catch {
    return undefined;
  }
}

export function prepareLumenFrontendHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  rawHtml: string | undefined
) {
  const frontendDistUri = vscode.Uri.joinPath(context.extensionUri, "frontend", "dist");
  const logoUri = vscode.Uri.joinPath(context.extensionUri, "assets", "brand", "lumen-logo.svg");
  const nonce = createNonce();

  if (typeof rawHtml === "string") {
    return prepareBuiltFrontendHtml(webview, rawHtml, frontendDistUri, logoUri, nonce);
  }
  return getMissingBuildHtml(webview, logoUri, nonce);
}

export async function getLumenFrontendHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): Promise<string> {
  return prepareLumenFrontendHtml(context, webview, await readLumenFrontendIndexHtml(context));
}

/**
 * Estilo de entrada elegido por el usuario (lumen.entryStyle). Viaja como
 * atributo del <html> para estar presente desde el PRIMER frame del webview:
 * un mensaje llegaria tarde para la cortina y las variantes CSS de la
 * transicion (selectores html[data-lumen-entry-style="..."]).
 */
function resolveEntryStyleAttribute() {
  const style = vscode.workspace.getConfiguration("lumen").get<string>("entryStyle", "eclipse");
  return /^[a-z][a-z-]{0,23}$/.test(style) ? style : "eclipse";
}

function prepareBuiltFrontendHtml(
  webview: vscode.Webview,
  html: string,
  frontendDistUri: vscode.Uri,
  logoUri: vscode.Uri,
  nonce: string
) {
  const distBase = withTrailingSlash(webview.asWebviewUri(frontendDistUri).toString());
  const logoWebviewUri = webview.asWebviewUri(logoUri);
  const csp = createContentSecurityPolicy(webview, nonce);
  const entryStyle = resolveEntryStyleAttribute();

  const headInjection = [
    `<base href="${distBase}">`,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<link rel="icon" type="image/svg+xml" href="${logoWebviewUri}">`,
    `<script nonce="${nonce}">window.__LUMEN_WEBVIEW_BOOTSTRAP__={protocolVersion:${lumenWebviewProtocolVersion},mode:"mock"};</script>`
  ].join("\n");

  return html
    .replace(/<script\b(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)
    .replace(/<html\b/i, `<html data-lumen-entry-style="${entryStyle}"`)
    .replace(/<head>/i, `<head>\n${headInjection}`);
}

function getMissingBuildHtml(webview: vscode.Webview, logoUri: vscode.Uri, nonce: string) {
  const logoWebviewUri = webview.asWebviewUri(logoUri);
  const csp = createContentSecurityPolicy(webview, nonce);

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

export function createContentSecurityPolicy(webview: vscode.Webview, nonce: string) {
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

export function createNonce() {
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
