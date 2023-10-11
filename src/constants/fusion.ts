import { APP_NAME, STAGE } from "../config";

export const DEFAULT_FUSION_CONCURRENCY_LIMIT = 10;
export const FUSION_CREDIT_TYPE_ID = "type1";
export const CREDIT_CHECK_TRIGGER = 10;
export const SYSTEM_APP = "system";

export const SYSTEM_APP_MODULES = {
  Loop: "loop",
  LoopWhile: "loop_while",
  LoopEnd: "loop_end",
};

export const FlowRunnerLambda = {
  SessionInitializer: `${APP_NAME}-${STAGE}-sessionInitializer`,
  SessionExecutor: `${APP_NAME}-${STAGE}-sessionExecutor`,
} as const;
