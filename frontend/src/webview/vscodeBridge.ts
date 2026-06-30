import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "./messages";

type VsCodeApi = {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __LUMEN_WEBVIEW_BOOTSTRAP__?: {
      protocolVersion: number;
      mode: "mock";
    };
  }
}

let vscodeApi: VsCodeApi | undefined;

export function createVscodeBridge() {
  return {
    get isConnected() {
      return Boolean(getVsCodeApi());
    },
    post(message: WebviewToExtensionMessage) {
      getVsCodeApi()?.postMessage(message);
    },
    onMessage(handler: (message: ExtensionToWebviewMessage) => void) {
      const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => {
        if (event.data?.type) {
          handler(event.data);
        }
      };

      window.addEventListener("message", listener);
      return () => window.removeEventListener("message", listener);
    }
  };
}

function getVsCodeApi() {
  if (vscodeApi) return vscodeApi;
  if (typeof window.acquireVsCodeApi === "function") {
    vscodeApi = window.acquireVsCodeApi();
  }
  return vscodeApi;
}
