export const lumenEngineProtocolVersion = 1;

export const lumenEngineErrorCodes = [
  "INVALID_REQUEST",
  "UNKNOWN_METHOD",
  "INVALID_PARAMS",
  "DATABASE_ERROR",
  "UNKNOWN_ERROR"
] as const;

export const lumenEngineBridgeErrorCodes = [
  "ENGINE_NOT_FOUND",
  "ENGINE_START_FAILED",
  "ENGINE_TIMEOUT",
  "ENGINE_PROTOCOL_ERROR"
] as const;

export type LumenEngineErrorCode = (typeof lumenEngineErrorCodes)[number];
export type LumenEngineBridgeErrorCode = (typeof lumenEngineBridgeErrorCodes)[number];
export type LumenEngineAnyErrorCode = LumenEngineErrorCode | LumenEngineBridgeErrorCode;

export type LumenEngineErrorPayload = {
  code: LumenEngineErrorCode;
  message: string;
  recoverable: boolean;
};

export class LumenEngineError extends Error {
  override readonly name = "LumenEngineError";

  constructor(
    readonly code: LumenEngineAnyErrorCode,
    message: string,
    readonly recoverable: boolean
  ) {
    super(message);
  }
}

export type LumenEngineHealthCheckResult = {
  protocolVersion: number;
  engineVersion: string;
  dbStatus: "ready" | "error";
  dbPath: string;
  dbError?: string;
};

export type LumenEngineSessionState = {
  lastMode: string | null;
  lastRouteId: string | null;
  lastModuleId: string | null;
  lastExerciseId: string | null;
  updatedAt: string;
};

export type LumenEngineMethodMap = {
  "engine.healthCheck": {
    params: Record<string, never>;
    result: LumenEngineHealthCheckResult;
  };
  "session.getLastState": {
    params: Record<string, never>;
    result: { state: LumenEngineSessionState | null };
  };
  "session.saveLastState": {
    params: {
      lastMode?: string | null;
      lastRouteId?: string | null;
      lastModuleId?: string | null;
      lastExerciseId?: string | null;
    };
    result: { state: LumenEngineSessionState };
  };
};

export type LumenEngineMethod = keyof LumenEngineMethodMap;

export type LumenEngineRequest<M extends LumenEngineMethod = LumenEngineMethod> = {
  id: string;
  method: M;
  params: LumenEngineMethodMap[M]["params"];
};

export type LumenEngineResponse =
  | {
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      id: string | null;
      ok: false;
      error: LumenEngineErrorPayload;
    };
