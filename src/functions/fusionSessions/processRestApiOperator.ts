import middy from "@middy/core";
import { Handler } from "aws-lambda";
import axios, { AxiosRequestConfig, Method } from "axios";
import moment from "moment";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { ModuleType } from "../../enums/3pApp";
import { getFunctions, parseExpression } from "../../helpers/3pExpression";
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
  sendFusionNotification,
  updateOperatorLogs,
  updateSession,
  updateSessionOperatorStatus,
} from "../../util/3pModule";
import { applyToValues } from "../../util/index";

export const processRestApiOperatorHandler: Handler<FusionLambdaEvent> = async (
  event
) => {
  console.time("process-rest-api-time");
  console.log("Process Rest API lambda hit: ", JSON.stringify(event, null, 2));
  const operatorLogs: FusionOperatorLog[] = [];
  try {
    await processRestApiOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processRestApiOperator.ts:39 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
      err
    );
    const session = await getSessionItem(event.sessionSlug, event.accountId);
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
    if (session.session_data.import_chunk?.parent_slug) {
      await dynamodb.update({
        TableName: envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE,
        Key: {
          id: "import-chunk",
          slug: session.session_data.import_chunk?.slug,
        },
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: {
          "#status": "chunk_status",
        },
        ExpressionAttributeValues: {
          ":status": "Failed",
        },
        ReturnValues: "ALL_NEW",
      });
      const { Attributes } = await dynamodb.update({
        TableName: envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS,
        Key: {
          id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
          slug: session.session_data.import_chunk?.parent_slug,
        },
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "Failed",
        },
        ReturnValues: "ALL_NEW",
      });

      await sendFusionNotification({
        ...session,
        is_import_session: true,
        session_data: {
          ...session.session_data,
          payload: Attributes,
        },
      });
    }
  }
  console.timeEnd("process-rest-api-time");
};

export const processRestApiOperator = async (event: ProcessOperatorParams) => {
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

  const { session_operators, session_variables = {} } = sessionData || {};
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

  const gfmlFunctions = await getFunctions(appSlug, accountId);
  // const bodyData: ParseOptions["body"] = {};
  // const options: ParseOptions = {
  //   body: bodyData,
  //   responses: responses || {},
  //   functions: gfmlFunctions,
  // };
  // console.log(options);

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  operatorLogs.push(
    generateLog("Input Expression", "Success", {
      data: {
        inputExpressions,
      },
    })
  );
  console.log(
    "🚀 ~ file: processRestApiOperator.ts:179 ~ processRestApiOperator ~ inputExpressions:",
    JSON.stringify(inputExpressions, null, 2)
  );
  const parameters = await parseExpression<{
    url: string;
    headers?: { key: string; value: string }[];
    body?: Record<string, unknown>;
    method: Method;
  }>(inputExpressions, {
    body: { ...responses, session_variables },
    responses: { ...responses, session_variables },
    functions: gfmlFunctions,
  });
  console.log(
    "🚀 ~ file: processRestApiOperator.ts:181 ~ processRestApiOperator ~ parameters:",
    JSON.stringify(parameters, null, 2)
  );

  operatorLogs.push(
    generateLog("Parsed Params", "Success", {
      data: {
        parameters,
      },
    })
  );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  //Get Parsed Values
  const url = parameters.url;
  const method = parameters.method;
  const headers = parameters.headers;
  const body = parameters.body;

  operatorLogs.push(
    generateLog("Axios payload", "Success", {
      data: {
        url,
        method,
        headers,
        body,
      },
    })
  );

  let response;
  if (url && method) {
    let apiHeaders = {};
    if (Array.isArray(headers)) {
      apiHeaders =
        headers?.reduce<Record<string, string>>((acc, cur) => {
          if (cur.key && cur.value) {
            acc[cur.key] = cur.value;
          }

          return acc;
        }, {}) || {};
    }
    operatorLogs.push(
      generateLog("Parsed Headers", "Success", {
        data: {
          headers: apiHeaders,
        },
      })
    );
    response = await makeRequest(url, method, apiHeaders, body);
  }
  console.log(
    "🚀 ~ file: processRestApiOperator.ts:223 ~ processRestApiOperator ~ response:",
    response
  );

  operatorLogs.push(
    generateLog("Rest-Api Operator", "Success", {
      data: response ?? "Url was empty",
    })
  );

  await updateOperatorLogs(
    sessionSlug,
    operatorIdx,
    "Complete",
    operatorLogs,
    accountId
  );

  await finalizeOperator({
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    appSlug,
    inputs: parameters,
    outputs: { data: response ?? "Url was empty" },
    moduleType: ModuleType.Action,
    sessionData,
    queueItem,
    responses: s3Responses,
    operatorLogs,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

export const makeRequest = async (
  url: string,
  method: Method,
  headers: Record<string, string>,
  body: unknown
) => {
  //Iterate Payload For Axios
  const axiosPayload: AxiosRequestConfig = {
    url,
    method,
    headers,
    data: body,
  };
  console.log("Axios Payload", axiosPayload);
  const response = await axios.request(axiosPayload);
  return response.data as unknown;
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processRestApiOperatorHandler);
