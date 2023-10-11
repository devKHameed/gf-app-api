import middy from "@middy/core";
import { Handler } from "aws-lambda";
import { last } from "lodash";
import moment from "moment";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { ModuleType } from "../../enums/3pApp";
import {
  ParseOptions,
  getFunctions,
  parseExpression,
} from "../../helpers/3pExpression";
import { parseTagsToExpression } from "../../helpers/3pExpression/tagsParser";
import { executeModules } from "../../helpers/3pModule";
import { dynamodb } from "../../helpers/db";
import {
  addOperatorOperations,
  finalizeOperator,
  getFusionWebhook,
  getPrevOperatorResponses,
  getWebhook,
  updateConnectionToken,
} from "../../helpers/fusion";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import {
  FusionLambdaEvent,
  FusionOperatorLog,
  ProcessOperatorParams,
} from "../../types";
import {
  checkIfExpired,
  generateLog,
  get3pApp,
  getAppConnection,
  getAppModule,
  getFusionConnection,
  getSessionItem,
  sendFusionNotification,
  updateSession,
  updateSessionOperatorStatus,
} from "../../util/3pModule";
import { applyToValues } from "../../util/index";

export const processOperatorHandler: Handler<FusionLambdaEvent> = async (
  event
) => {
  console.time("process-operator-time");
  console.log("Process operators lambda hit: ", JSON.stringify(event, null, 2));

  const operatorLogs: FusionOperatorLog[] = [];

  try {
    await processOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processOperator.ts:53 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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

  // console.timeEnd("process-operator-time");
};

export const processOperator = async (event: ProcessOperatorParams) => {
  const {
    sessionSlug,
    appModuleSlug,
    appSlug,
    accountId,
    responses: s3Responses,
    queueItem,
    operatorLogs = [],
  } = event;

  const bodyData: ParseOptions["body"] = {
    parameters: {},
    temp: {},
    connection: {},
    gf_app_config: {},
  };

  const session = await getSessionItem(sessionSlug, accountId);
  const sessionData = session.session_data || {};
  const operatorIdx = sessionData.session_operators.findIndex(
    (op) => op.operator_slug === queueItem.operator_id
  );
  const operator = sessionData.session_operators[operatorIdx];
  if (!operator) {
    throw new Error("Missing Operator");
  }

  operatorLogs.push(
    generateLog("Operator initiated", "Success", {
      sessionSlug,
      operatorSlug: operator.operator_slug,
      appSlug,
      appModuleSlug,
    })
  );

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

  const appItem = await Promise.all([
    get3pApp(appSlug, accountId),
    get3pApp(appSlug, "3p:global"),
  ]).then((res) => res.filter((item) => !!item)[0]);

  if (!appItem) {
    throw new Error("App not found");
  }

  const isGlobal = appItem.id.startsWith("3p:global");

  const moduleItem = await getAppModule(
    appModuleSlug,
    isGlobal ? "3p:global" : accountId
  );

  if (!moduleItem) {
    throw new Error("Module not found");
  }

  const gfmlFunctions = await getFunctions(
    appSlug,
    isGlobal ? "3p:global" : accountId
  );

  let appConnectionSlug =
    moduleItem.connection_id || moduleItem.alt_connection_id;

  if (moduleItem.module_type === ModuleType.InstantTrigger) {
    const webhook = await getWebhook(accountId, appConnectionSlug, isGlobal);

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    appConnectionSlug = webhook.connection_id || webhook.alt_connection_id;
  }

  const responses = await getPrevOperatorResponses(
    queueItem.inputs,
    s3Responses
  );
  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  console.log(
    "🚀 ~ file: processOperator.ts:222 ~ processOperator ~ inputExpressions:",
    JSON.stringify(inputExpressions, null, 2)
  );
  const parameters = await parseExpression<Record<string, unknown>>(
    inputExpressions,
    {
      body: bodyData,
      responses: {
        ...responses,
        session_variables: sessionData.session_variables || {},
      },
      functions: gfmlFunctions,
    }
  );
  console.log(
    "🚀 ~ file: processOperator.ts:231 ~ processOperator ~ parameters:",
    JSON.stringify(parameters, null, 2)
  );
  bodyData["parameters"] = parameters;

  if (appConnectionSlug) {
    const appConnection = await getAppConnection(
      appConnectionSlug,
      isGlobal ? "3p:global" : accountId
    );

    if (!appConnection) {
      throw new Error("App connection not found");
    }

    try {
      // console.log("parse expression: ", appConnection?.common_data);
      bodyData["common"] = await parseExpression(appConnection?.common_data, {
        body: bodyData,
        responses: {},
        functions: gfmlFunctions,
      });
      // console.log("common: ", bodyData.common);
    } catch (e) {
      console.log("No common refresh needed");
    }

    let connectionSlug = (parameters?.fusion_connection_slug as string) || "";
    if (moduleItem.module_type === ModuleType.InstantTrigger) {
      const fusionWebhook = await getFusionWebhook(accountId, connectionSlug);
      connectionSlug = fusionWebhook?.fusion_connection_slug;
    }

    if (!connectionSlug) {
      throw new Error("No connection found");
    }

    const connectionItem = await getFusionConnection(connectionSlug, accountId);

    const connection = connectionItem?.meta_data as { expires: string };
    bodyData["connection"] = connection;
    bodyData["data"] = connection;

    const updateToken = checkIfExpired(connection);

    if (updateToken) {
      bodyData["connection"] =
        (await updateConnectionToken({
          appConnection,
          connectionItem,
          bodyData,
          oauthType: appConnection.type,
          appSlug,
          gfmlFunctions,
          pushToLogs: (log: FusionOperatorLog) => {
            operatorLogs.push(log);
          },
        })) || connection;
    }
  }

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  // console.log(
  //   "Executing module: ",
  //   JSON.stringify(
  //     {
  //       module: moduleItem,
  //       app: appItem,
  //       operatorOutputs: responses,
  //       bodyData,
  //       appSlug,
  //       // gfmlFunctions,
  //       pushToLogs: () => {
  //         // operatorLogs.push(log);
  //       },
  //       accountId,
  //       triggerOperator: operator as FusionOperator,
  //       fusionSlug: session.fusion_slug,
  //       operatorIdx,
  //       isGlobal,
  //     },
  //     null,
  //     2
  //   )
  // );

  const operatorResponses = await executeModules({
    module: moduleItem,
    app: appItem,
    operatorOutputs: responses,
    bodyData,
    appSlug,
    gfmlFunctions,
    pushToLogs: (log: FusionOperatorLog) => {
      operatorLogs.push(log);
    },
    accountId,
    triggerOperator: operator,
    fusionSlug: session.fusion_slug,
    operatorIdx,
    isGlobal,
  });

  const lastResponse = last(operatorResponses);
  console.log(
    "🚀 ~ file: processOperator.ts:339 ~ processOperator ~ lastResponse:",
    lastResponse
  );

  // operatorLogs.push(
  //   generateLog(
  //     `Operation ${(operationIdx || 0) + 1} Completed with output`,
  //     "Success",
  //     {
  //       response: lastResponse,
  //     }
  //   )
  // );

  // console.log(
  //   "🚀 ~ file: processOperator.ts:233 ~ processOperator ~ lastResponse",
  //   JSON.stringify(lastResponse, null, 2)
  // );
  await finalizeOperator({
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    appSlug,
    inputs: parameters,
    outputs: lastResponse,
    moduleType: moduleItem.module_type as ModuleType,
    sessionData,
    queueItem,
    responses: s3Responses,
    operatorLogs,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processOperatorHandler);
