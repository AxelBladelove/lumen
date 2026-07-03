import * as vscode from "vscode";
import { createContentSecurityPolicy, createNonce } from "./lumenWebviewContent";

export function showLumenLoadingPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    "lumen.loading",
    "Lumen",
    vscode.ViewColumn.Active,
    {
      enableScripts: false,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "assets")]
    }
  );

  panel.webview.html = getLoadingHtml(context, panel.webview);
  return panel;
}

function getLoadingHtml(context: vscode.ExtensionContext, webview: vscode.Webview) {
  const nonce = createNonce();
  const csp = createContentSecurityPolicy(webview, nonce);
  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "assets", "brand", "lumen-logo.svg")
  );
  const wordmarkUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "assets", "brand", "lumen-wordmark.webp")
  );

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lumen</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #010508;
      }

      body {
        display: grid;
        place-items: center;
        color: #effffb;
        font-family: Inter, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
      }

      .lumen-loader {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        overflow: hidden;
        background:
          radial-gradient(ellipse at 50% 42%, rgba(0, 146, 252, 0.2), transparent 34%),
          radial-gradient(ellipse at 50% 58%, rgba(2, 10, 20, 0.9), rgba(1, 4, 9, 0.98) 70%),
          #010508;
      }

      .lumen-loader::before,
      .lumen-loader::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .lumen-loader::before {
        opacity: 0.34;
        background:
          linear-gradient(112deg, transparent 0 32%, rgba(0, 146, 252, 0.08) 46%, transparent 62%),
          repeating-linear-gradient(90deg, rgba(125, 178, 217, 0.014) 0 1px, transparent 1px 82px);
      }

      .lumen-loader::after {
        background: radial-gradient(ellipse at center, transparent 0 42%, rgba(0, 0, 0, 0.62) 100%);
      }

      .loader-mark {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: center;
        gap: 20px;
        animation: loaderMarkIn 1.4s cubic-bezier(0.18, 0.88, 0.22, 1) both;
      }

      .loader-logo {
        width: 92px;
        height: 92px;
        object-fit: contain;
        filter:
          drop-shadow(0 0 18px rgba(0, 146, 252, 0.46))
          drop-shadow(0 18px 38px rgba(0, 0, 0, 0.62));
      }

      .loader-wordmark {
        width: auto;
        height: 40px;
        object-fit: contain;
        filter:
          drop-shadow(0 0 16px rgba(0, 146, 252, 0.34))
          drop-shadow(0 8px 24px rgba(0, 0, 0, 0.65));
      }

      .loader-bar {
        position: absolute;
        z-index: 1;
        left: 50%;
        top: calc(50% + 104px);
        width: min(232px, calc(100vw - 96px));
        height: 4px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(54, 76, 96, 0.42);
        box-shadow:
          inset 0 1px 1px rgba(244, 252, 251, 0.12),
          0 0 24px rgba(0, 146, 252, 0.14);
        transform: translateX(-50%);
      }

      .loader-bar i {
        display: block;
        width: 100%;
        height: 100%;
        border-radius: inherit;
        background:
          radial-gradient(ellipse at 72% 50%, rgba(244, 252, 251, 0.86), transparent 48%),
          linear-gradient(90deg, #0092fc, #5fc8ff);
        box-shadow:
          0 0 18px rgba(0, 146, 252, 0.5),
          inset 0 1px 1px rgba(244, 252, 251, 0.4);
        animation: loaderProgressFill 1.8s linear both;
        transform: scaleX(0.01);
        transform-origin: left center;
      }

      @keyframes loaderMarkIn {
        from {
          opacity: 0;
          transform: translateY(2px) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translateY(-12px) scale(1);
        }
      }

      @keyframes loaderProgressFill {
        from {
          transform: scaleX(0.01);
        }
        to {
          transform: scaleX(1);
        }
      }
    </style>
  </head>
  <body>
    <main class="lumen-loader" aria-label="Cargando Lumen">
      <div class="loader-mark">
        <img class="loader-logo" src="${logoUri}" alt="">
        <img class="loader-wordmark" src="${wordmarkUri}" alt="Lumen">
      </div>
      <div class="loader-bar" aria-hidden="true"><i></i></div>
    </main>
  </body>
</html>`;
}
