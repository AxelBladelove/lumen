export const lumenEngineProtocolVersion = 5;

export const lumenEngineErrorCodes = [
  "INVALID_REQUEST",
  "UNKNOWN_METHOD",
  "INVALID_PARAMS",
  "DATABASE_ERROR",
  "SOURCE_NOT_FOUND",
  "TOOLCHAIN_NOT_FOUND",
  "BUILD_DIR_ERROR",
  "COMPILER_FAILED",
  "NO_ACTIVE_EXERCISE",
  "TESTS_INVALID",
  "IMPORT_FAILED",
  "IMPORT_CONFLICT",
  "ACTIVITY_NOT_FOUND",
  "ACTIVITY_LOCKED",
  "ACTIVITY_UNSUPPORTED",
  "WORKSPACE_ERROR",
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

export type LumenEngineErrorDetail = {
  code: string;
  path: string;
  message: string;
};

export type LumenEngineErrorPayload = {
  code: LumenEngineErrorCode;
  message: string;
  recoverable: boolean;
  details?: LumenEngineErrorDetail[];
};

export class LumenEngineError extends Error {
  override readonly name = "LumenEngineError";

  constructor(
    readonly code: LumenEngineAnyErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly details?: LumenEngineErrorDetail[]
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

export type LumenExerciseTestCaseStatus =
  | "passed"
  | "failed"
  | "timeout"
  | "runtime_error"
  | "inconclusive";

export type LumenExerciseTestCase = {
  caseId: string;
  status: LumenExerciseTestCaseStatus;
  durationMs: number;
  stdinPreview?: string;
  expected?: string;
  observed?: string;
  outputTruncated?: true;
};

export type LumenExerciseTestGroup = {
  groupId: string;
  phase: string;
  casesPassed: number;
  casesTotal: number;
  cases: LumenExerciseTestCase[];
};

export type LumenExerciseTestsCompileError = {
  status: "compile_error";
  diagnostics: LumenCompileDiagnostic[];
  rawOutput: string;
  durationMs: number;
};

export type LumenExerciseTestsExecuted = {
  status: "passed" | "failed";
  exerciseId: string;
  version: string;
  casesPassed: number;
  casesTotal: number;
  durationMs: number;
  completed: boolean;
  newlyCompleted: boolean;
  groups: LumenExerciseTestGroup[];
};

export type LumenExerciseRunTestsResult =
  | LumenExerciseTestsCompileError
  | LumenExerciseTestsExecuted;

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

export type LumenExerciseImportSummary = {
  title: string;
  routeId: string | null;
  moduleId: string | null;
  orderInModule: number | null;
  nodeType: string | null;
};

export type LumenExerciseImportResult = {
  activityId: string;
  version: string;
  installPath: string;
  packageSha256: string;
  alreadyInstalled: boolean;
  activity: LumenExerciseImportSummary;
};

export type LumenActiveExerciseNone = {
  status: "none";
};

export type LumenActiveExerciseMissing = {
  status: "missing";
  exerciseId: string;
};

export type LumenActiveExerciseDescriptor = {
  exerciseId: string;
  version: string;
  installPath: string;
  workspacePath: string;
  entrypointPath: string;
  title: string;
  routeId: string | null;
  moduleId: string | null;
  nodeType: string | null;
};

export type LumenActiveExerciseReady = {
  status: "ready";
  active: LumenActiveExerciseDescriptor;
};

export type LumenActiveExerciseResult =
  | LumenActiveExerciseNone
  | LumenActiveExerciseMissing
  | LumenActiveExerciseReady;

export type LumenExerciseMode = "route" | "free";

export type LumenExerciseActivateParams = {
  exerciseId: string;
  mode: LumenExerciseMode;
  workspaceRoot: string;
};

export type LumenExerciseActivateResult = {
  created: boolean;
  active: LumenActiveExerciseDescriptor;
};

export type LumenModuleSnapshotNodeStatus = "active" | "locked" | "completed";

export type LumenModuleSnapshotNode = {
  exerciseId: string;
  title: string;
  primaryTopics: string[];
  nodeType: string;
  orderInModule: number | null;
  status: LumenModuleSnapshotNodeStatus;
};

export type LumenModuleSnapshot = {
  routeId: string;
  moduleId: string;
  activeExerciseId: string | null;
  nodes: LumenModuleSnapshotNode[];
};

export type LumenModuleSnapshotResult = {
  snapshot: LumenModuleSnapshot;
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
  "exercise.compile": {
    params: { sourcePath: string };
    result: LumenCompileResult;
  };
  "exercise.runTests": {
    params: Record<string, never>;
    result: LumenExerciseRunTestsResult;
  };
  "exercise.import": {
    params: { esexPath: string };
    result: LumenExerciseImportResult;
  };
  "exercise.getActive": {
    params: Record<string, never>;
    result: LumenActiveExerciseResult;
  };
  "exercise.activate": {
    params: LumenExerciseActivateParams;
    result: LumenExerciseActivateResult;
  };
  "route.getModuleSnapshot": {
    params: { routeId: string; moduleId: string };
    result: LumenModuleSnapshotResult;
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
