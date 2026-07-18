import * as vscode from "vscode";
import type { LumenEngineClient } from "./engine/lumenEngineClient";
import type { ExerciseRunKind, LumenEntryState } from "./lumenProtocol";
import {
  getLumenFrontendResourceRoots,
  prepareLumenFrontendHtml,
  readLumenFrontendIndexHtml
} from "./lumenWebviewContent";
import { LumenRoutePathViewProvider } from "./lumenRoutePathViewProvider";
import { LumenWebviewHost, type LumenModePhase } from "./lumenWebviewHost";
import {
  isLayoutTransitionActivatable,
  isRightGroupMoveConfirmed
} from "./lumenPanelLayout";

const lumenPanelViewType = "lumen.routePathPanel";
let layoutTransitionSequence = 0;

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
 * 2. El frontend bootea sin que se toque el layout. `frontend.ready` sólo se
 *    emite después de que la cortina haya atravesado una pintura real.
 * 3. Al recibir `frontend.ready`, el host crea un token por entrada y prearma
 *    el protocolo mientras continúa la carga.
 * 4. Al arrancar el punch-in, el frontend entrega al Extension Host el delay
 *    óptico. Al cumplirse, el host pide una superficie segura sin intro.
 * 5. Sólo después de `frontend.layoutHandoffPrepared` se mueve el panel. Aunque
 *    VS Code recomponga una textura atrasada, esa textura ya contiene la UI de
 *    ruta congelada en el primer frame del landing, nunca el logo ampliado.
 */
export class LumenPanelController {
  private readonly host: LumenWebviewHost;
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private disposingForExit = false;
  private watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  private layoutHandoffTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdogRebooted = false;
  private readySignal = createSignal();
  private layoutHandoffSignal = createSignal();
  private layoutCommitArmedSignal = createSignal();
  private layoutHandoffPreparedSignal = createSignal();
  private revealedSignal = createSignal();
  private activeLayoutToken: string | undefined;
  private layoutHandoffReached = false;
  private layoutPreparationRequested = false;
  private layoutPreparationCompleted = false;
  private layoutRevealCompleted = false;
  private frontendIndexHtmlPromise: Promise<string | undefined>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly engineClient: LumenEngineClient,
    private readonly onPanelClosed: () => void,
    private readonly onExerciseRunRequested: (kind: ExerciseRunKind) => void
  ) {
    // Se inicia al activar la extension, no al clickear el icono. En la ruta
    // normal el HTML ya esta en memoria y el siguiente cambio visible puede ser
    // directamente la cortina, sin esperar I/O despues de abrir el launcher.
    this.frontendIndexHtmlPromise = readLumenFrontendIndexHtml(context);
    this.host = new LumenWebviewHost({
      context,
      outputChannel,
      engineClient,
      onExitRequested: () => void vscode.commands.executeCommand("lumen.exitMode"),
      onExerciseRunRequested: (kind) => this.onExerciseRunRequested(kind),
      onFrontendReady: () => {
        this.clearWatchdog();
        this.readySignal.resolve();
      },
      onFrontendLayoutHandoffReady: (delayMs, token) => this.scheduleLayoutHandoff(delayMs, token),
      onFrontendLayoutCommitArmed: (token) => {
        if (token === this.activeLayoutToken) this.layoutCommitArmedSignal.resolve();
      },
      onFrontendLayoutHandoffPrepared: (token) => {
        if (token !== this.activeLayoutToken || !this.layoutPreparationRequested) return;
        this.layoutPreparationCompleted = true;
        this.layoutHandoffPreparedSignal.resolve();
      },
      onFrontendRevealed: (token) => {
        if (token !== this.activeLayoutToken || !this.layoutPreparationCompleted) return;
        this.layoutRevealCompleted = true;
        this.revealedSignal.resolve();
      },
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

  postExerciseRunState(active: ExerciseRunKind | null) {
    this.host.setExerciseRunState(active);
  }

  getPreloadedFrontendHtml() {
    return this.frontendIndexHtmlPromise;
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
    this.layoutHandoffSignal = createSignal();
    this.layoutCommitArmedSignal = createSignal();
    this.layoutHandoffPreparedSignal = createSignal();
    this.revealedSignal = createSignal();
    this.activeLayoutToken = undefined;
    this.layoutHandoffReached = false;
    this.layoutPreparationRequested = false;
    this.layoutPreparationCompleted = false;
    this.layoutRevealCompleted = false;
    this.watchdogRebooted = false;
    this.clearLayoutHandoffTimer();

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
        this.clearLayoutHandoffTimer();
        this.host.unbindWebview(webview);
        for (const disposable of this.panelDisposables) {
          try {
            disposable.dispose();
          } catch {
            // Nada: el objetivo es no dejar estado colgado.
          }
        }
        this.panelDisposables = [];
        if (this.panel === panel) {
          this.panel = undefined;
          this.activeLayoutToken = undefined;
          this.layoutHandoffReached = false;
          this.layoutPreparationRequested = false;
          this.layoutPreparationCompleted = false;
          this.layoutRevealCompleted = false;
          this.readySignal.cancel();
          this.layoutHandoffSignal.cancel();
          this.layoutCommitArmedSignal.cancel();
          this.layoutHandoffPreparedSignal.cancel();
          this.revealedSignal.cancel();
        }
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

  /** Espera el punto cubierto, cronometrado por el Extension Host. */
  waitForLayoutHandoff(timeoutMs: number) {
    return this.layoutHandoffSignal.wait(timeoutMs);
  }

  /** Espera que el frontend acepte el token antes del único movimiento. */
  waitForLayoutCommitArmed(timeoutMs: number) {
    return this.layoutCommitArmedSignal.wait(timeoutMs);
  }

  /** Espera que la superficie sin intro atraviese una pintura real. */
  waitForLayoutHandoffPrepared(timeoutMs: number) {
    return this.layoutHandoffPreparedSignal.wait(timeoutMs);
  }

  /** Espera `frontend.revealed`; false si no llega dentro del timeout. */
  waitForRevealed(timeoutMs: number) {
    return this.revealedSignal.wait(timeoutMs);
  }

  /** Prearma el protocolo y asigna un token exclusivo a esta entrada. */
  requestLayoutCommit() {
    const token = `${Date.now().toString(36)}-${(++layoutTransitionSequence).toString(36)}`;
    this.activeLayoutToken = token;
    this.layoutHandoffReached = false;
    this.layoutPreparationRequested = false;
    this.layoutPreparationCompleted = false;
    this.layoutRevealCompleted = false;
    this.host.postLayoutCommitRequested(token);
    return token;
  }

  /** Revalida panel y generacion despues del ultimo await de la entrada. */
  canActivateLayoutTransition(token: string) {
    return isLayoutTransitionActivatable(
      token,
      this.activeLayoutToken,
      Boolean(this.panel),
      this.layoutPreparationCompleted,
      this.layoutRevealCompleted
    );
  }

  /** Ordena sustituir el intro por el frame seguro antes de mover el panel. */
  requestLayoutHandoffPreparation() {
    if (!this.activeLayoutToken || !this.layoutHandoffReached) return false;
    this.layoutPreparationRequested = true;
    this.host.postLayoutHandoffPrepare(this.activeLayoutToken);
    return true;
  }

  /** Confirma que el host terminó sus comandos y autoriza el zoom-out. */
  confirmLayoutCommitted() {
    if (!this.activeLayoutToken || !this.layoutPreparationCompleted) return false;
    this.host.postLayoutCommitted(this.activeLayoutToken);
    return true;
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
   * `frontend.layoutHandoffPrepared`: el frame seguro ya fue pintado y el host
   * acaba de alcanzar el tramo cubierto del punch-in.
   */
  async moveAsideAndLock() {
    const panel = this.panel;
    if (!panel || !revealSafely(panel)) return false;
    const sourceGroup = findLumenPanelGroup();
    if (!sourceGroup) return false;
    const sourceViewColumn = sourceGroup.viewColumn;

    // El movimiento y la proporción son visualmente autoritativos: si fallan,
    // la entrada debe restaurarse en vez de confirmar una UI fullscreen.
    await vscode.commands.executeCommand("workbench.action.moveEditorToRightGroup");

    // Con mas de dos grupos (el usuario ya tenia splits) se respeta su layout
    // y solo se omite la proporcion fija; el sash sigue siendo ajustable.
    if (vscode.window.tabGroups.all.length === 2) {
      await vscode.commands.executeCommand("vscode.setEditorLayout", {
        orientation: 0,
        groups: [{ size: 0.67 }, { size: 0.33 }]
      });
    }

    // Bloquear solo si el panel esta solo en su grupo: si comparte grupo con
    // editores del usuario (layouts multi-grupo), bloquear los afectaria.
    const panelGroup = findLumenPanelGroup();
    const moveConfirmed = Boolean(
      panelGroup &&
        isRightGroupMoveConfirmed(
          sourceViewColumn,
          panelGroup.viewColumn,
          vscode.window.tabGroups.all.map((group) => group.viewColumn)
        )
    );
    if (!panelGroup || !moveConfirmed || !revealSafely(panel)) return false;
    if (panelGroup.tabs.length === 1) {
      // El lock no cambia ningun pixel del handoff y es best-effort. Mantenerlo
      // fuera de la ruta de activacion evita que un comando de VS Code colgado
      // congele una entrada visualmente ya terminada.
      void executeCommandSafely("workbench.action.lockEditorGroup");
    }
    return true;
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
      // Refrescar tambien renueva la copia precargada usada por la proxima
      // entrada (importante durante desarrollo si el build aparecio despues de
      // activar la extension).
      this.frontendIndexHtmlPromise = readLumenFrontendIndexHtml(this.context);
      const rawHtml = await this.frontendIndexHtmlPromise;
      panel.webview.html = prepareLumenFrontendHtml(this.context, panel.webview, rawHtml);
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
    this.clearLayoutHandoffTimer();
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

  private scheduleLayoutHandoff(delayMs: number, token: string) {
    if (!this.activeLayoutToken || token !== this.activeLayoutToken) return;
    this.clearLayoutHandoffTimer();
    const safeDelayMs = Number.isFinite(delayMs) ? Math.min(1000, Math.max(0, delayMs)) : 0;
    this.layoutHandoffTimer = setTimeout(() => {
      this.layoutHandoffTimer = undefined;
      if (token !== this.activeLayoutToken) return;
      this.layoutHandoffReached = true;
      this.layoutHandoffSignal.resolve();
    }, safeDelayMs);
  }

  private clearLayoutHandoffTimer() {
    if (this.layoutHandoffTimer) {
      clearTimeout(this.layoutHandoffTimer);
      this.layoutHandoffTimer = undefined;
    }
  }
}

function createSignal() {
  let settledResult: boolean | undefined;
  let settleFn: ((value: boolean) => void) | undefined;
  const promise = new Promise<boolean>((resolve) => {
    settleFn = (value) => {
      if (settledResult !== undefined) return;
      settledResult = value;
      resolve(value);
    };
  });

  return {
    resolve() {
      settleFn?.(true);
    },
    cancel() {
      settleFn?.(false);
    },
    async wait(timeoutMs: number) {
      if (settledResult !== undefined) return settledResult;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waitResult = await Promise.race([
        promise,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        })
      ]);
      if (timer) clearTimeout(timer);
      return waitResult;
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

function findLumenPanelGroup() {
  return vscode.window.tabGroups.all.find((group) =>
    group.tabs.some(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        tab.input.viewType.includes(lumenPanelViewType)
    )
  );
}

async function executeCommandSafely(command: string) {
  await vscode.commands.executeCommand(command).then(undefined, () => undefined);
}
