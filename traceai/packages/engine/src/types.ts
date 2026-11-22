import type { CommonSettings } from '@traceai/nodes';

export type StepErrorCode =
  | 'invalid-config'
  | 'expression-error'
  | 'http-error'
  | 'provider-error'
  | 'timeout'
  | 'cancelled'
  | 'internal';

export type StepError = {
  code: StepErrorCode;
  message: string;
  // Whether the caller may retry this step.
  retryable: boolean;
  // Which node failed, and which field of its config (for example "prompt").
  nodeId?: string | undefined;
  path?: string | undefined;
  details?: unknown;
};

export type StepUsage = {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  costUsd?: number | undefined;
};

export type NodeResult =
  | {
      status: 'success';
      output: unknown;
      // Only for nodes that choose a path, like Condition ("true" or "false").
      branch?: string | undefined;
      logs: string[];
      durationMs: number;
      usage?: StepUsage | undefined;
    }
  | {
      status: 'error';
      error: StepError;
      logs: string[];
      durationMs: number;
    }
  | {
      // The node did not run, for example the other side of a Condition.
      status: 'skipped';
      reason: string;
    };

// Everything one executor needs to run one node, one time.
export type ExecContext = {
  runId: string;
  workflowId: string;
  workspaceId: string;
  nodeId: string;
  nodeType: string;
  // 1 for the first try, 2 after one retry, and so on.
  attempt: number;
  // Which pass of a loop. 0 when there is no loop.
  iteration: number;
  // The node config after {{ }} expressions are filled in.
  config: Record<string, unknown>;
  settings: CommonSettings;
  // Output of the previous node, and the data the run was started with.
  input: unknown;
  trigger: unknown;
  // Replay in safe mode: nodes with side effects must not do the real thing.
  safeMode: boolean;
  // Fires on timeout or cancel. Long work must stop when it fires.
  signal: AbortSignal;
  log: (message: string) => void;
};

export type NodeExecutor = (context: ExecContext) => Promise<NodeResult>;