import * as vscode from "vscode";
import type { LumenEngineClient } from "./engine/lumenEngineClient";
import type { LumenEntryState } from "./lumenProtocol";
import {
  getLumenFrontendHtml,
  getLumenFrontendResourceRoots,
  prepareLumenFrontendHtml
} from "./lumenWebviewContent";
import { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";
import { LumenWebviewHost, type LumenModePhase } from "./lumenWebviewHost";

const lumenPanelViewType = "lumen.routePathPanel";

/**
 * Si el frontend no reporta `frontend.ready` en este plazo, el HTML se
 * reasigna una vez. Cubre la corrupcion de carga observada cuando una
 * mutacion de layout interrumpe el fetch de modulos del webview (el sintoma
 * era un SyntaxError de identificador duplicado en el chunk principal y la
 * cortina estatica congelada para siempre).
 */
const bootWatchdogMs = 5000;

/**
 * Panel de editor que aloja la UI real de Lumen.
 *
 * Ciclo de vida disenado para que NINGUNA mutacion de layout ocurra mientras
 * el webview carga modulos (la causa raiz de los boots corruptos):
 *
 * 1. `createFullScreen()` crea el panel en el grupo ACTIVO (sin split) y le
 *    asigna el HTML en el mismo turno; la cortina estatica del propio HTML
 *    cubre el editor desde el primer frame.
 * 2. El frontend bootea a pantalla completa sin que se toque el layout.
 * 3. Cuando la carga termina detras de la cortina (`frontend.loadingComplete`),
 *    `moveAsideAndLock()` ejecuta el unico cambio de layout: mover el panel a
 *    un grupo derecho, fijar 2/3 + 1/3 y bloquear el grupo. Solo despues el
 *    frontend recibe `lumen.reveal` y corre el fade final.
 */
export class LumenPanelController {
  private readonly host: LumenWebviewHost;
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private disposingForExit = false;
  private watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdogRebooted = false;
  private readySignal = createSignal();
  private loadingCompleteSignal = createSignal();
  private revealedSignal = createSignal();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly engineClient: LumenEngineClient,
    private readonly onPanelClosed: () => void
  ) {
    this.host = new LumenWebviewHost({
      context,
      outputChannel,
      engineClient,
      onExitRequested: () => void vscode.commands.executeCommand("lumen.exitMode"),
      onFrontendReady: () => {
        this.clearWatchdog();
        this.readySignal.resolve();
      },
      onFrontendLoadingComplete: () => this.loadingCompleteSignal.resolve(),
      onFrontendRevealed: () => this.revealedSignal.resolve(),
      perfViewType: LumenRoutePathViewProvider.viewType
    });
  }

  get exists() {
    return Boolean(this.panel);
  }

  setPhase(phase: LumenModePhase) {
    this.host.setPhase(phase);
  }

  setEntryState(entryState: LumenEntryState) {
    this.host.setEntryState(entryState);
  }

  /**
   * Crea el panel en el grupo activo y asigna el HTML sincronicamente.
   * `rawHtml` debe venir preleido (readLumenFrontendIndexHtml) para que la
   * creacion, el HTML y el Zen Mode del caller compartan un unico turno.
   */
  createFullScreen(rawHtml: string | undefined) {
    // Una entrada nueva siempre parte de un panel fresco: si quedo uno de una
    // sesion anterior (p. ej. una salida que fallo a medias), se descarta.
    if (this.panel) {
      const stale = this.panel;
      this.panel = undefined;
      try {
        stale.dispose();
      } catch {
        // Ya estaba disposed: solo importaba soltar la referencia.
      }
    }

    this.readySignal = createSignal();
    this.loadingCompleteSignal = createSignal();
    this.revealedSignal = createSignal();
    this.watchdogRebooted = false;

    const panel = vscode.window.createWebviewPanel(
      lumenPanelViewType,
      "Lumen",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: getLumenFrontendResourceRoots(this.context)
      }
    );

    this.panel = panel;
    this.panelDisposables = [];

    // Referencia capturada ANTES de cualquier disposal: el getter
    // `panel.webview` lanza "Webview is disposed" dentro de onDidDispose, y un
    // throw ahi dejaria `this.panel` apuntando a un panel muerto (con toda la
    // cadena de re-entradas rotas que eso implica).
    const webview = panel.webview;

    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "assets", "brand", "lumen-editor-icon.svg");
    this.host.bindWebview(webview, this.panelDisposables);

    panel.onDidDispose(
      () => {
        this.clearWatchdog();
        this.host.unbindWebview(webview);
        for (const disposable of this.panelDisposables) {
          try {
            disposable.dispose();
          } catch {
            // Nada: el objetivo es no dejar estado colgado.
          }
        }
        this.panelDisposables = [];
        if (this.panel === panel) this.panel = undefined;
        if (!this.disposingForExit) this.onPanelClosed();
      },
      undefined,
      this.panelDisposables
    );

    webview.html = prepareLumenFrontendHtml(this.context, webview, rawHtml);
    this.armWatchdog(rawHtml);
  }

  /** Espera `frontend.ready`; false si no llega dentro del timeout. */
  waitForReady(timeoutMs: number) {
    return this.readySignal.wait(timeoutMs);
  }

  /**
   * Espera `frontend.loadingComplete` (barra al 100%, cortina aún fullscreen);
   * false si no llega dentro del timeout. Es el punto en el que el layout final
   * debe colocarse, detras de la cortina, antes de revelar.
   */
  waitForLoadingComplete(timeoutMs: number) {
    return this.loadingCompleteSignal.wait(timeoutMs);
  }

  /** Espera `frontend.revealed`; false si no llega dentro del timeout. */
  waitForRevealed(timeoutMs: number) {
    return this.revealedSignal.wait(timeoutMs);
  }

  /**
   * Ordena al frontend descartar la cortina con su fade. Se llama solo despues
   * de que el layout final quedo colocado, para que el revelado aterrice en la
   * vista dividida y no en un frame del modulo a pantalla completa.
   */
  signalReveal() {
    this.host.postReveal();
  }

  async postExerciseCompleted(exerciseId: string) {
    if (!this.panel) return;
    await this.host.postExerciseCompleted(exerciseId);
  }

  async activateAndOpenExercise(exerciseId: string) {
    if (!this.panel) return undefined;
    return this.host.activateAndOpenExercise(exerciseId);
  }

  /**
   * Unico cambio de layout de la entrada: panel al grupo derecho, proporcion
   * 2/3 editor + 1/3 Lumen y grupo bloqueado para que abrir archivos no
   * aterrice sobre la UI. Se ejecuta cuando el frontend reporta
   * `frontend.loadingComplete`: la ruta ya rindio y no hay modulos en vuelo,
   * pero la cortina sigue cubriendo la UI hasta `signalReveal()`.
   */
  async moveAsideAndLock() {
    const panel = this.panel;
    if (!panel || !revealSafely(panel)) return;

    await executeCommandSafely("workbench.action.moveEditorToRightGroup");

    // Con mas de dos grupos (el usuario ya tenia splits) se respeta su layout
    // y solo se omite la proporcion fija; el sash sigue siendo ajustable.
    if (vscode.window.tabGroups.all.length === 2) {
      await vscode.commands
        .executeCommand("vscode.setEditorLayout", {
          orientation: 0,
          groups: [{ size: 0.67 }, { size: 0.33 }]
        })
        .then(undefined, () => undefined);
    }

    // Bloquear solo si el panel esta solo en su grupo: si comparte grupo con
    // editores del usuario (layouts multi-grupo), bloquear los afectaria.
    const panelGroup = vscode.window.tabGroups.all.find((group) =>
      group.tabs.some((tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes(lumenPanelViewType))
    );
    if (panelGroup && panelGroup.tabs.length === 1) {
      if (!revealSafely(panel)) return;
      await executeCommandSafely("workbench.action.lockEditorGroup");
    }
  }

  /** Revelar el panel existente sin tocar proporciones del layout. */
  async reveal() {
    if (!this.panel) return false;
    return revealSafely(this.panel);
  }

  async refresh() {
    const panel = this.panel;
    if (!panel) return false;
    try {
      panel.webview.html = await getLumenFrontendHtml(this.context, panel.webview);
      return true;
    } catch {
      return false;
    }
  }

  async disposeForExit() {
    const panel = this.panel;
    if (!panel) return;

    this.disposingForExit = true;
    this.clearWatchdog();
    try {
      if (revealSafely(panel)) {
        await executeCommandSafely("workbench.action.unlockEditorGroup");
        await executeCommandSafely("workbench.action.closeEditorsInGroup");
      }
      if (this.panel === panel) {
        try {
          panel.dispose();
        } catch {
          // Ya disposed por closeEditorsInGroup: el onDidDispose limpio todo.
        }
      }
    } finally {
      this.disposingForExit = false;
    }
  }

  private armWatchdog(rawHtml: string | undefined) {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      const panel = this.panel;
      if (!panel || this.watchdogRebooted) return;
      this.watchdogRebooted = true;
      this.outputChannel.appendLine(
        `Frontend did not report ready within ${bootWatchdogMs}ms; reloading webview HTML once.`
      );
      try {
        // El nonce nuevo garantiza un string distinto, asi VS Code recarga el
        // iframe aunque el contenido base sea el mismo.
        panel.webview.html = prepareLumenFrontendHtml(this.context, panel.webview, rawHtml);
      } catch {
        // Panel disposed entre el timer y el reintento: no hay nada que recargar.
      }
    }, bootWatchdogMs);
  }

  private clearWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }
}

function createSignal() {
  let resolved = false;
  let resolveFn: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolveFn = () => {
      resolved = true;
      resolve();
    };
  });

  return {
    resolve() {
      resolveFn?.();
    },
    async wait(timeoutMs: number) {
      if (resolved) return true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        promise.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        })
      ]);
      if (timer) clearTimeout(timer);
      return result;
    }
  };
}

/** reveal() lanza si el panel fue disposed en paralelo; false en ese caso. */
function revealSafely(panel: vscode.WebviewPanel) {
  try {
    panel.reveal(panel.viewColumn, false);
    return true;
  } catch {
    return false;
  }
}

async function executeCommandSafely(command: string) {
  await vscode.commands.executeCommand(command).then(undefined, () => undefined);
}
