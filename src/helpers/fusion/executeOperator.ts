/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { FusionLambda } from "../../constants/3pApp";
import { ModuleType } from "../../enums/3pApp";
import { InvocationType } from "../../enums/lambda";
import { processAWSOperatorHandler } from "../../functions/fusionSessions/processAWSOperator";
import { processAutomationOperatorHandler } from "../../functions/fusionSessions/processAutomationOperator";
import { processBasicSystemOperatorHandler } from "../../functions/fusionSessions/processBasicSystemOperator";
import { processChartDataOperatorHandler } from "../../functions/fusionSessions/processChartDataOperator";
import { processChartOperatorHandler } from "../../functions/fusionSessions/processChartOperator";
import { processChatOperatorHandler } from "../../functions/fusionSessions/processChatOperator";
import { processCompleteTaskOperatorHandler } from "../../functions/fusionSessions/processCompleteTaskOperator";
import { processCrudOperatorsHandler } from "../../functions/fusionSessions/processCrudOperator";
import { processFlowControlOperatorHandler } from "../../functions/fusionSessions/processFlowControlOperator";
import { processGetNextTaskOperatorHandler } from "../../functions/fusionSessions/processGetNextTaskOperator";
import { processOperatorHandler } from "../../functions/fusionSessions/processOperator";
import { processRestApiOperatorHandler } from "../../functions/fusionSessions/processRestApiOperator";
import { processSkillOperatorHandler } from "../../functions/fusionSessions/processSkillOperator";
import { processStripeOperatorHandler } from "../../functions/fusionSessions/processStripeOperator";
import { processWebhookResponseOperatorHandler } from "../../functions/fusionSessions/processWebhookResponseOperator";
import { getFunctions, parseExpression } from "../../helpers/3pExpression";
import { parseTagsToExpression } from "../../helpers/3pExpression/tagsParser";
import {
  EdgeData,
  FusionLambdaEvent,
  GFMLFunction,
  OperatorConditions,
  SessionData,
} from "../../types";
import {
  getSessionItem,
  isAWSOperator,
  isAutomationOperator,
  isBasicSystemOperator,
  isChartDataOperator,
  isChartOperator,
  isChatOperator,
  isCompleteTaskOperator,
  isCrudOperator,
  isFlowControlOperator,
  isGetNextTaskOperator,
  isRestApiOperator,
  isSkillOperator,
  isSkippableOperator,
  isStripeOperator,
  isWebhookResponseOperator,
  updateSession,
  updateSessionOperatorStatus,
} from "../../util/3pModule";
import { validateCondition } from "../../util/fusion";
import { applyToValues } from "../../util/index";
import { invokeLambda } from "../lambda";
import { QueueItem } from "./executionQueue";
import {
  addOperatorOperations,
  finalizeOperator,
  getPrevOperatorResponses,
} from "./index";

type ExecuteOperatorEvent = {
  accountId: string;
  queueItem: QueueItem;
  sessionOperators: SessionData["session_operators"];
  sessionSlug: string;
  roundRobin?: boolean;
  prevOperatorResponses?: Record<string, unknown>;
  caller?: string;
  singleLambda?: boolean;
  initiateLambda?: boolean;
  sessionVariables?: Record<string, unknown>;
};

const lambdaFunctionMap = {
  [FusionLambda.ProcessChartOperators]: processChartOperatorHandler,
  [FusionLambda.ProcessAutomationOperators]: processAutomationOperatorHandler,
  [FusionLambda.ProcessCrudOperators]: processCrudOperatorsHandler,
  [FusionLambda.ProcessChartDataOperators]: processChartDataOperatorHandler,
  [FusionLambda.ProcessRestApiOperators]: processRestApiOperatorHandler,
  [FusionLambda.ProcessBasicSystemOperators]: processBasicSystemOperatorHandler,
  [FusionLambda.ProcessSkillOperators]: processSkillOperatorHandler,
  [FusionLambda.processAWSOperators]: processAWSOperatorHandler,
  [FusionLambda.ProcessFlowControlOperators]: processFlowControlOperatorHandler,
  [FusionLambda.ProcessWebhookResponseOperators]:
    processWebhookResponseOperatorHandler,
  [FusionLambda.ProcessStripeOperators]: processStripeOperatorHandler,
  [FusionLambda.ProcessChatOperators]: processChatOperatorHandler,
  [FusionLambda.ProcessGetNextTaskOperators]: processGetNextTaskOperatorHandler,
  [FusionLambda.ProcessCompleteTaskOperators]:
    processCompleteTaskOperatorHandler,
  [FusionLambda.ProcessOperators]: processOperatorHandler,
};

const processOperator = async (event: ExecuteOperatorEvent) => {
  const {
    accountId,
    queueItem,
    sessionOperators,
    sessionSlug,
    roundRobin = false,
    prevOperatorResponses = {},
    caller,
    singleLambda = false,
    initiateLambda = false,
    sessionVariables = {},
  } = event;
  // console.log(
  //   "🚀 ~ file: executeOperator.ts:42 ~ processOperator ~ queueItem",
  //   queueItem
  // );
  const responses = queueItem?.responses || {};

  const operatorIdx = sessionOperators.findIndex(
    (op) => op.operator_slug === queueItem.operator_id
  );

  const operator = sessionOperators[operatorIdx];
  // console.log(
  //   "🚀 ~ file: executeOperatorV2.ts:40 ~ processOperator ~ operator",
  //   operator
  // );

  if (!operator) {
    console.log("Operator not found");
    return;
  }

  const appSlug = operator.app;
  const appModuleSlug = operator.app_module;

  if (!appSlug || !appModuleSlug) {
    console.log("App not found", { appModuleSlug, appSlug });
    return;
  }

  const params = {
    sessionSlug,
    appSlug,
    appModuleSlug,
    accountId,
    responses,
    queueItem,
    // queueId,
    caller,
  };
  let lambdaName = "";

  const session = await getSessionItem(sessionSlug, accountId);

  const edgeValid = await isEdgeValid({
    edgeData: operator.edge_data,
    responses: {
      ...responses,
      ...prevOperatorResponses,
      session_variables: session?.session_data?.session_variables || {},
    },
    accountId,
  });
  console.log(
    "🚀 ~ file: executeOperator.ts:155 ~ processOperator ~ edgeValid:",
    edgeValid
  );

  const operatorValid = await isOperatorValid({
    operatorConditions: operator.operator_conditions,
    responses: {
      ...responses,
      ...prevOperatorResponses,
      session_variables: session?.session_data?.session_variables || {},
    },
    accountId,
  });
  console.log(
    "🚀 ~ file: executeOperator.ts:165 ~ processOperator ~ operatorValid:",
    operatorValid
  );

  switch (true) {
    case isSkippableOperator(operator) || !edgeValid || !operatorValid: {
      // console.log("Skippable Operator: ", operator.app_module);
      await handleSkippableOperator({
        accountId,
        operator,
        sessionSlug,
        sessionOperators,
        operatorIdx,
        appSlug,
        queueItem,
        responses,
        prevOperatorResponses,
        skipNext: !edgeValid,
      });
      break;
    }
    case isChartOperator(operator): {
      lambdaName = FusionLambda.ProcessChartOperators;
      break;
    }
    case isAutomationOperator(operator):
      lambdaName = FusionLambda.ProcessAutomationOperators;
      break;
    case isCrudOperator(operator):
      lambdaName = FusionLambda.ProcessCrudOperators;
      break;
    case isChartDataOperator(operator):
      lambdaName = FusionLambda.ProcessChartDataOperators;
      break;
    case isRestApiOperator(operator):
      lambdaName = FusionLambda.ProcessRestApiOperators;
      break;
    case isBasicSystemOperator(operator):
      lambdaName = FusionLambda.ProcessBasicSystemOperators;
      break;
    case isSkillOperator(operator):
      lambdaName = FusionLambda.ProcessSkillOperators;
      break;
    case isAWSOperator(operator):
      lambdaName = FusionLambda.processAWSOperators;
      break;
    case isFlowControlOperator(operator):
      lambdaName = FusionLambda.ProcessFlowControlOperators;
      break;
    case isWebhookResponseOperator(operator):
      lambdaName = FusionLambda.ProcessWebhookResponseOperators;
      break;
    case isStripeOperator(operator):
      lambdaName = FusionLambda.ProcessStripeOperators;
      break;
    case isChatOperator(operator):
      lambdaName = FusionLambda.ProcessChatOperators;
      break;
    case isGetNextTaskOperator(operator):
      lambdaName = FusionLambda.ProcessGetNextTaskOperators;
      break;
    case isCompleteTaskOperator(operator):
      lambdaName = FusionLambda.ProcessCompleteTaskOperators;
      break;
    default:
      lambdaName = FusionLambda.ProcessOperators;
      break;
  }

  if (lambdaName) {
    await processQueueItem(
      lambdaName,
      params,
      roundRobin,
      initiateLambda || !singleLambda
    );
  }
};

type IsEdgeValidParams = {
  edgeData?: EdgeData;
  accountId: string;
  responses: any;
};

type IsOperatorValidParams = {
  operatorConditions?: OperatorConditions;
  accountId: string;
  responses: any;
};

const isOperatorValid = async (data: IsOperatorValidParams) => {
  const { operatorConditions, accountId, responses } = data;

  if (!operatorConditions) {
    return true;
  }

  const s3ParsedResponses = await getPrevOperatorResponses(
    operatorConditions,
    responses as Record<
      string,
      { responseUrl: string; index?: number | undefined }
    >
    // sessionOperators.map((s) => `${s.operator_slug}`)
  );
  console.log(
    "🚀 ~ file: executeOperator.ts:103 ~ processOperator ~ s3ParsedResponses:",
    JSON.stringify(s3ParsedResponses, null, 2)
  );

  const gfmlFunctions = await getFunctions("", accountId);

  const inputExpressions = applyToValues(
    operatorConditions,
    parseTagsToExpression
  );

  console.log(
    "🚀 ~ file: executeOperator.ts:106 ~ processOperator ~ inputExpressions:",
    JSON.stringify(inputExpressions, null, 2)
  );

  const operatorValid = await validateOperator(
    inputExpressions as unknown as OperatorConditions,
    s3ParsedResponses,
    gfmlFunctions
  );

  return operatorValid;
};

const isEdgeValid = async (data: IsEdgeValidParams) => {
  const { edgeData, accountId, responses } = data;
  console.log(
    "🚀 ~ file: executeOperator.ts:292 ~ isEdgeValid ~ edgeData, accountId, responses:",
    edgeData,
    accountId,
    responses
  );

  if (!edgeData) {
    return true;
  }

  const s3ParsedResponses = await getPrevOperatorResponses(
    edgeData,
    responses as Record<
      string,
      { responseUrl: string; index?: number | undefined }
    >
    // sessionOperators.map((s) => `${s.operator_slug}`)
  );
  console.log(
    "🚀 ~ file: executeOperator.ts:103 ~ processOperator ~ s3ParsedResponses:",
    JSON.stringify(s3ParsedResponses, null, 2)
  );

  const gfmlFunctions = await getFunctions("", accountId);

  const inputExpressions = applyToValues(edgeData, parseTagsToExpression);

  console.log(
    "🚀 ~ file: executeOperator.ts:106 ~ processOperator ~ inputExpressions:",
    JSON.stringify(inputExpressions, null, 2)
  );

  const edgeValid = await validateEdge(
    inputExpressions as unknown as EdgeData,
    s3ParsedResponses,
    gfmlFunctions
  );

  return edgeValid;
};

const validateOperator = async (
  operatorConditions?: OperatorConditions,
  responses?: Record<string, unknown>,
  gfmlFunctions: GFMLFunction[] = []
) => {
  if (!operatorConditions?.condition_sets?.length) {
    return true;
  }

  const conditionSets = await parseExpression<EdgeData["condition_sets"]>(
    operatorConditions.condition_sets,
    {
      body: responses,
      responses,
      functions: gfmlFunctions,
    }
  );

  for (const { condition_set: conditionSet } of conditionSets) {
    const isSetValid = conditionSet.every((condition) =>
      validateCondition(condition)
    );

    if (isSetValid) {
      return true;
    }
  }

  return false;
};

const validateEdge = async (
  edgeData?: EdgeData,
  responses?: Record<string, unknown>,
  gfmlFunctions: GFMLFunction[] = []
) => {
  console.log(
    "🚀 ~ file: executeOperator.ts:167 ~ responses:",
    JSON.stringify(responses, null, 2)
  );
  console.log(
    "🚀 ~ file: executeOperator.ts:167 ~ edgeData:",
    JSON.stringify(edgeData, null, 2)
  );
  if (!edgeData?.condition_sets?.length) {
    return true;
  }

  const conditionSets = await parseExpression<EdgeData["condition_sets"]>(
    edgeData.condition_sets,
    {
      body: responses,
      responses,
      functions: gfmlFunctions,
    }
  );
  console.log(
    "🚀 ~ file: executeOperator.ts:217 ~ conditionSets:",
    JSON.stringify(conditionSets, null, 2),
    JSON.stringify(
      {
        body: responses,
        responses,
      },
      null,
      2
    )
  );

  for (const { condition_set: conditionSet } of conditionSets) {
    const isSetValid = conditionSet.every((condition) =>
      validateCondition(condition)
    );

    if (isSetValid) {
      return true;
    }
  }

  return false;
};

const processQueueItem = async (
  lambdaName: string,
  params: Record<string, unknown>,
  roundRobin = false,
  _invokeLambda = true
) => {
  if (_invokeLambda) {
    await invokeLambda(lambdaName, params, InvocationType.Event, {
      roundRobin,
    });
  } else {
    await lambdaFunctionMap[lambdaName](
      params as FusionLambdaEvent,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      {} as any,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      () => {}
    );
  }
};

const handleSkippableOperator = async (data: {
  accountId: string;
  operator: SessionData["session_operators"][number];
  sessionSlug: string;
  sessionOperators: SessionData["session_operators"];
  operatorIdx: number;
  appSlug: string;
  queueItem: QueueItem;
  responses: Record<string, { responseUrl: string; index?: number }>;
  prevOperatorResponses?: Record<string, unknown>;
  skipNext: boolean;
}) => {
  const {
    accountId,
    operator,
    sessionSlug,
    sessionOperators,
    appSlug,
    operatorIdx,
    queueItem,
    responses,
    prevOperatorResponses,
    skipNext,
  } = data;
  // await consumeCredits(accountId, operator.total_credit);

  const operationIdx = await addOperatorOperations(
    accountId,
    sessionSlug,
    operator.operator_slug!
  );

  await updateSession(
    accountId,
    sessionSlug,
    `SET #sessionData.#operatorResponses.#operatorSlug.#operations[${operationIdx}].#data = :operatorResponse`,
    {
      ":operatorResponse": {
        status: "Complete",
        inputs: null,
        outputs: null,
      },
    },
    {
      "#sessionData": "session_data",
      "#operatorResponses": "operator_responses",
      "#operatorSlug": operator.operator_slug,
      "#operations": "operations",
      "#data": "data",
    }
  );

  await updateSessionOperatorStatus(
    sessionSlug,
    "Skipped",
    operatorIdx,
    accountId
  );

  await finalizeOperator({
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    appSlug,
    inputs: null,
    outputs: responses?.[operator.operator_slug!],
    moduleType: ModuleType.Action,
    sessionData: { session_operators: sessionOperators },
    queueItem,
    responses,
    prevOperatorResponses,
    skipNext,
    operatorIdx,
  });
};

export default processOperator;
