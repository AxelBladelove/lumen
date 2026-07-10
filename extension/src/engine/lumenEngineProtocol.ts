export const lumenEngineProtocolVersion = 2;

export const lumenEngineErrorCodes = [
  "INVALID_REQUEST",
  "UNKNOWN_METHOD",
  "INVALID_PARAMS",
  "DATABASE_ERROR",
  "SOURCE_NOT_FOUND",
  "TOOLCHAIN_NOT_FOUND",
  "BUILD_DIR_ERROR",
  "COMPILER_FAILED",
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

export type LumenCompileDiagnosticKind = "error" | "warning" | "note";

export type LumenCompileDiagnostic = {
  kind: LumenCompileDiagnosticKind;
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
};

export type LumenCompileToolchain = {
  compilerPath: string;
};

export type LumenCompileSuccess = {
  status: "success";
  executablePath: string;
  diagnostics: LumenCompileDiagnostic[];
  durationMs: number;
  toolchain: LumenCompileToolchain;
};

export type LumenCompileFailure = {
  status: "compile_error";
  executablePath: null;
  diagnostics: LumenCompileDiagnostic[];
  rawOutput: string;
  durationMs: number;
  toolchain: LumenCompileToolchain;
};

export type LumenCompileResult = LumenCompileSuccess | LumenCompileFailure;

export type LumenToolchainReady = {
  status: "ready";
  compilerPath: string;
  compilerVersion: string;
};

export type LumenToolchainMissing = {
  status: "missing";
  compilerPath: null;
  compilerVersion: null;
  hint: string;
};

export type LumenToolchainCheckResult = LumenToolchainReady | LumenToolchainMissing;

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
  "exercise.compile": {
    params: { sourcePath: string };
    result: LumenCompileResult;
  };
  "toolchain.check": {
    params: Record<string, never>;
    result: LumenToolchainCheckResult;
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
