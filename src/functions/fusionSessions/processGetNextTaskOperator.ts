import middy from "@middy/core";
import { Handler } from "aws-lambda";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { ACCOUNT_SOC_TASKS_TABLE_NAME, envTableNames } from "../../config";
import { ModuleType } from "../../enums/3pApp";
import {
  ParseOptions,
  getFunctions,
  parseExpression,
} from "../../helpers/3pExpression";
import { parseTagsToExpression } from "../../helpers/3pExpression/tagsParser";
import { dynamodb } from "../../helpers/db";
import {
  addOperatorOperations,
  finalizeOperator,
  getPrevOperatorResponses,
} from "../../helpers/fusion";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import {
  FusionLambdaEvent,
  FusionOperatorLog,
  ProcessOperatorParams,
} from "../../types/Fusion";
import {
  generateLog,
  getSessionItem,
  updateOperatorLogs,
  updateSessionOperatorStatus,
} from "../../util/3pModule";
import { applyToValues } from "../../util/index";

export const processGetNextTaskOperatorHandler: Handler<
  FusionLambdaEvent
> = async (event) => {
  // console.time("process-automation-operator-time");
  // console.log(
  //   "process automation operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );

  const operatorLogs: FusionOperatorLog[] = [];

  await processGetNextTaskOperator({ ...event, operatorLogs });

  // console.timeEnd("process-crud-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

export const processGetNextTaskOperator = async (
  event: ProcessOperatorParams
) => {
  const {
    sessionSlug,
    appSlug,
    appModuleSlug,
    accountId,
    queueItem,
    responses: s3Responses,
    operatorLogs = [],
  } = event;

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", session);
  const { session_data: sessionData } = session || {};

  //Verify this
  const operatorIdx = sessionData.session_operators.findIndex(
    (operator) => operator.operator_slug === queueItem.operator_id
  );
  // console.log("Operator Index: ", operatorIdx);
  const operator = sessionData.session_operators[operatorIdx];
  // console.log("Operator: ", operator);

  operatorLogs.push(
    generateLog("Operator initiated", "Success", {
      sessionSlug,
      operatorSlug: queueItem.operator_id,
      appSlug,
      appModuleSlug,
    })
  );

  if (!operator) {
    return;
  }

  // Consume Credit
  // console.log("Consume Credit");
  // await consumeCredits(accountId, operator.total_credit);

  //SET STATUS AS PROCESSING
  // console.log("Set Status as Processing");
  await updateSessionOperatorStatus(
    sessionSlug,
    "Processing",
    operatorIdx,
    accountId
  );

  const operationIdx = await addOperatorOperations(
    accountId,
    sessionSlug,
    operator.operator_slug!
  );

  const responses = await getPrevOperatorResponses(
    queueItem.inputs,
    s3Responses
  );

  const functions = await getFunctions(appSlug, accountId);
  const options: ParseOptions = { body: {}, responses, functions };
  // console.log("Options: ", options);

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  // console.log(
  //   "🚀 ~ file: processGetNextTaskOperator.ts:113 ~ processGetNextTaskOperator ~ inputExpressions:",
  //   JSON.stringify(inputExpressions, null, 2)
  // );
  const parameters = await parseExpression<Record<string, unknown>>(
    inputExpressions,
    options
  );
  // console.log(
  //   "🚀 ~ file: processGetNextTaskOperator.ts:121 ~ processGetNextTaskOperator ~ parameters:",
  //   JSON.stringify(parameters, null, 2)
  // );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  const { account_id: socDeviceId } = parameters;

  const response = await getNextSocialTasks(
    {
      operatorLogs,
      sessionSlug,
      operatorIdx,
      accountId,
    },
    socDeviceId as string
  );

  await finalizeOperator({
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    appSlug,
    inputs: parameters,
    outputs: response,
    moduleType: ModuleType.Action,
    sessionData,
    queueItem,
    responses: s3Responses,
    operatorLogs,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

type OperatorOptions = {
  sessionSlug: string;
  operatorLogs: FusionOperatorLog[];
  operatorIdx: number;
  accountId: string;
};

const getNextSocialTasks = async (
  options: OperatorOptions,
  socDeviceId: string
) => {
  const { operatorLogs, sessionSlug, operatorIdx, accountId } = options;
  const logs = [...operatorLogs];

  const readParams: DynamoDB.DocumentClient.QueryInput = {
    TableName: `${envTableNames.DYNAMODB_ACCT_SOC_TASKS}`,
    KeyConditionExpression: "#id = :id AND #slug < :slug",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": `ready:${socDeviceId}:${ACCOUNT_SOC_TASKS_TABLE_NAME}`,
      ":slug": Date.now(),
    },
  };
  // console.log("Getting documents Query: ", readParams);
  const { Items: socialTaskItems = [] } = await dynamodb.query(readParams);
  // console.log("Query Results: ", socialTaskItems);

  if (socialTaskItems.length === 0) {
    logs.push(generateLog("No Read Items", "Warning", {}));
  }

  const response = {
    data: socialTaskItems,
    total_records: socialTaskItems.length,
  };

  //Get Latest Operator OUPTPUTS
  // console.log("Get Latest Operator Outputs");
  logs.push(generateLog("Read Object", "Success", response));

  await updateOperatorLogs(
    sessionSlug,
    operatorIdx,
    "Complete",
    logs,
    accountId
  );
  return response;
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processGetNextTaskOperatorHandler);
