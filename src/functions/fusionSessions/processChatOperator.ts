import middy from "@middy/core";
import { Handler } from "aws-lambda";
import moment from "moment";
import { ModuleType } from "../../enums/3pApp";
import { parseExpression, ParseOptions } from "../../helpers/3pExpression";
import { parseTagsToExpression } from "../../helpers/3pExpression/tagsParser";
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

export const processChatOperatorHandler: Handler<FusionLambdaEvent> = async (
  event
) => {
  // console.time("process-chat-operator-time");
  // console.log(
  //   "process chat operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );

  const operatorLogs: FusionOperatorLog[] = [];

  try {
    await processChatOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processChatOperator.ts:34 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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

  // console.timeEnd("process-chat-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

export const processChatOperator = async (event: ProcessOperatorParams) => {
  const {
    sessionSlug,
    appSlug,
    accountId,
    queueItem,
    responses: s3Responses,
    operatorLogs = [],
  } = event;

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", session);
  const { session_data } = session || {};

  const { session_operators, account_slug, account_id, session_init_vars } =
    session_data;
  const { chat_id, chat_client_id, message_value, chat_user_id } =
    session_init_vars;
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
      appModuleSlug: event.appModuleSlug,
    })
  );

  if (!operator) {
    return;
  }

  // Consume Credit
  // console.log("Consume Credit");
  // await consumeCredits(account_slug, operator.total_credit);

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

  const bodyData: ParseOptions["body"] = {};
  const options: ParseOptions = {
    body: bodyData,
    responses,
    app: appSlug,
  };
  // console.log(options);

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  // console.log(
  //   "🚀 ~ file: processChatOperator.ts:137 ~ processChatOperator ~ inputExpressions:",
  //   JSON.stringify(inputExpressions, null, 2)
  // );
  const parameters = await parseExpression<{
    user_id: string;
  }>(inputExpressions, options);
  // console.log(
  //   "🚀 ~ file: processChatOperator.ts:139 ~ processChatOperator ~ parameters:",
  //   JSON.stringify(parameters, null, 2)
  // );
  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );
  const { user_id: userId } = parameters;

  const pushToLogs = (
    title: string,
    status: FusionOperatorLog["status"],
    data?: unknown
  ) => {
    operatorLogs.push(generateLog(title, status, data));
  };

  let response;
  try {
    // if (operator.app_module === ChatOperator.CloseThread) {
    //   console.log("Close Thread");
    //   response = await closeThread(
    //     tableName,
    //     `${chat_id}`,
    //     account_id,
    //     chat_user_id,
    //     pushToLogs
    //   );
    // } else if (operator.app_module === ChatOperator.AddSubscriber) {
    //   console.log("Add Subscriber");
    //   response = await addSub(
    //     tableName,
    //     userId,
    //     `${chat_id}`,
    //     account_id,
    //     `${chat_client_id}`,
    //     pushToLogs
    //   );
    // } else if (operator.app_module === ChatOperator.RemoveSubscriber) {
    //   console.log("Remove Subscriber");
    //   response = await removeSub(
    //     tableName,
    //     userId,
    //     `${chat_id}`,
    //     account_id,
    //     pushToLogs
    //   );
    // } else if (operator.app_module === ChatOperator.SendMessage) {
    //   console.log("Send Message");
    //   response = await sendMessage(
    //     tableName,
    //     `${chat_id}`,
    //     account_id,
    //     `${chat_user_id}`,
    //     `${message_value}`,
    //     pushToLogs
    //   );
    // }
  } catch (e) {
    console.log("Error: ", e);

    operatorLogs.push(generateLog("Tag Operation", "Failed", { reason: e }));
    await updateOperatorLogs(
      sessionSlug,
      operatorIdx,
      "Failed",
      operatorLogs,
      accountId
    );
    throw e;
  }

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
    outputs: response,
    moduleType: ModuleType.Action,
    sessionData: session_data,
    queueItem,
    responses: s3Responses,
    operatorLogs,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processChatOperatorHandler);
