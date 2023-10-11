import middy from "@middy/core";
import { Handler } from "aws-lambda";
import DynamoDB from "aws-sdk/clients/dynamodb";
import moment from "moment";
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
  updateSession,
  updateSessionOperatorStatus,
} from "../../util/3pModule";
import { applyToValues } from "../../util/index";

export const processCompleteTaskOperatorHandler: Handler<
  FusionLambdaEvent
> = async (event) => {
  // console.time("process-automation-operator-time");
  // console.log(
  //   "process automation operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );

  const operatorLogs: FusionOperatorLog[] = [];

  try {
    await processCompleteTaskOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processCompleteTaskOperator.ts:39 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
      err
    );
    await updateSession(
      event.accountId,
      event.sessionSlug,
      "SET session_data.error_logs = list_append(session_data.error_logs, :log), session_data.session_status = :sessionStatus, session_data.finish_time = :finishTime",
      {
        ":log": [
          {
            message: (err as Error).message,
            stack: (err as Error).stack,
            event,
          },
          ...operatorLogs,
        ],
        ":sessionStatus": "Failed",
        ":finishTime": moment.utc().format(),
      }
    );
  }

  // console.timeEnd("process-crud-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

export const processCompleteTaskOperator = async (
  event: ProcessOperatorParams
) => {
  const {
    sessionSlug,
    appSlug,
    accountId,
    queueItem,
    appModuleSlug,
    responses: s3Responses,
    operatorLogs = [],
  } = event;

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", session);
  const { session_data: sessionData } = session || {};

  //Verify this
  const { session_operators } = sessionData;
  const operatorIdx = session_operators.findIndex(
    (operator) => operator.operator_slug === queueItem.operator_id
  );
  // console.log("Operator Index: ", operatorIdx);
  const operator = session_operators[operatorIdx];
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
  const options: ParseOptions = { body: {}, responses: responses, functions };
  // console.log("Options: ", options);

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  // console.log(
  //   "🚀 ~ file: processCompleteTaskOperator.ts:139 ~ processCompleteTaskOperator ~ inputExpressions:",
  //   JSON.stringify(inputExpressions, null, 2)
  // );
  const parameters = await parseExpression<{
    task_id: string;
    device_id: string;
    task_results: Record<string, unknown>;
    task_status: string;
  }>(inputExpressions, options);
  // console.log(
  //   "🚀 ~ file: processCompleteTaskOperator.ts:144 ~ processCompleteTaskOperator ~ parameters:",
  //   JSON.stringify(parameters, null, 2)
  // );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  const response = await completeSocialTask(
    {
      operatorIdx,
      operatorLogs,
      sessionSlug,
      accountId,
    },
    parameters.task_id,
    parameters.device_id,
    parameters.task_status,
    parameters.task_results
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

const completeSocialTask = async (
  { operatorLogs, sessionSlug, operatorIdx, accountId }: OperatorOptions,
  taskId: string,
  deviceId: string,
  eventStatus: string,
  taskResults: any //Remove any when Task Results structure is finalized
) => {
  const logs = [...operatorLogs];

  //Get Item
  const getParams: DynamoDB.DocumentClient.GetItemInput = {
    TableName: `${envTableNames.DYNAMODB_ACCT_SOC_TASKS}`,
    Key: {
      id: `ready:${deviceId}:${ACCOUNT_SOC_TASKS_TABLE_NAME}`,
      slug: taskId,
    },
  };

  const { Item: socItem = {} } = await dynamodb.get(getParams);
  // console.log("Get Item Query: ", getParams);
  // console.log("Get Item Result: ", socItem);

  //Delete Item
  const deleteParams: DynamoDB.DocumentClient.DeleteItemInput = {
    TableName: `${envTableNames.DYNAMODB_ACCT_SOC_TASKS}`,
    Key: {
      id: `ready:${deviceId}:${ACCOUNT_SOC_TASKS_TABLE_NAME}`,
      slug: taskId,
    },
  };

  await dynamodb.delete(deleteParams);
  // console.log("Get Item Query: ", deleteParams);

  //Create New Item
  socItem.id = `complete:${deviceId}:${ACCOUNT_SOC_TASKS_TABLE_NAME}`;
  socItem.event_type_results = taskResults.eventResults;
  socItem.event_start_date = Date.now(); //We need to update this
  socItem.event_status = eventStatus;
  socItem.event_complete_date = Date.now();

  const createParams: DynamoDB.DocumentClient.PutItemInput = {
    TableName: `${envTableNames.DYNAMODB_ACCT_SOC_TASKS}`,
    Item: socItem,
  };

  await dynamodb.put(createParams);
  // console.log("Update Item Query: ", createParams);

  const response = {
    data: socItem,
  };
  logs.push(generateLog("Complete Social Task", "Success", response));

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
  .handler(processCompleteTaskOperatorHandler);
