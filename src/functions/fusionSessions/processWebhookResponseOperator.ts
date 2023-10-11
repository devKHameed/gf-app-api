import middy from "@middy/core";
import { Handler } from "aws-lambda";
import _ from "lodash";
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
import { FusionLambdaEvent, SessionData } from "../../types/Fusion";
import {
  getSessionItem,
  sendFusionNotification,
  updateSessionOperatorStatus,
  updateSessionStatus,
} from "../../util/3pModule";
import { applyToValues } from "../../util/index";

type Headers = { key: string; value: string }[];

export const processWebhookResponseOperatorHandler: Handler<
  FusionLambdaEvent
> = async (event) => {
  // console.time("webhook-response-operator-time");
  // console.log("webhook response operator lambda hit: ", event);
  try {
    await processWebhookResponseOperator(event);
  } catch (err) {
    const session = await getSessionItem(event.sessionSlug, event.accountId);
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

  // console.timeEnd("webhook-response-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

export const processWebhookResponseOperator = async (
  event: FusionLambdaEvent
) => {
  const {
    sessionSlug,
    appSlug,
    accountId,
    queueItem,
    responses: s3Responses,
  } = event;

  //Get The Session Data
  const session = await getSessionItem(sessionSlug, accountId);
  const session_operators: SessionData["session_operators"] = _.get(
    session,
    "session_data.session_operators",
    []
  );
  const operatorIdx = session_operators.findIndex(
    (operator) => operator.operator_slug === queueItem.operator_id
  );

  if (operatorIdx === -1) {
    // console.log("operator not found");
    // console.timeEnd("webhook-response-operator-time");
    // console.log("Memory: ", process.memoryUsage());
    return;
  }

  const operator = session_operators[operatorIdx];

  // Consume Credit
  // console.log("Consume Credit");
  // await consumeCredits(accountId, operator.total_credit);

  //SET STATUS AS PROCESSING
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
  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  // console.log(
  //   "🚀 ~ file: processWebhookResponseOperator.ts:143 ~ inputExpressions:",
  //   JSON.stringify(inputExpressions, null, 2)
  // );
  const parameters = await parseExpression<Record<string, unknown>>(
    inputExpressions,
    {
      body: responses,
      responses,
      functions: gfmlFunctions,
    }
  );
  // console.log(
  //   "🚀 ~ file: processWebhookResponseOperator.ts:152 ~ parameters:",
  //   JSON.stringify(parameters, null, 2)
  // );

  const { body: bodyResponse, headers, status } = parameters;

  const finalHeaders = processHeaders(headers as Headers);

  const finalPayload = {
    body: bodyResponse,
    headers: finalHeaders,
    status: status,
  };

  // console.log("This is final payload: ", finalPayload);

  await updateSessionOperatorStatus(
    sessionSlug,
    "Complete",
    operatorIdx,
    accountId
  );
  await updateSessionStatus(sessionSlug, null, accountId, finalPayload);

  await finalizeOperator({
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    appSlug,
    inputs: parameters,
    outputs: finalPayload,
    moduleType: ModuleType.Action,
    sessionData: session.session_data,
    queueItem,
    responses: s3Responses,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

function processHeaders(headers?: Headers | void) {
  if (!headers || headers.length < 1) {
    return {};
  }

  return headers.reduce<Record<string, string>>((acc, header) => {
    const { key, value } = header;
    acc[key] = value;
    return acc;
  }, {});
}

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processWebhookResponseOperatorHandler);
