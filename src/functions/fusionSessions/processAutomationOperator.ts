import middy from "@middy/core";
import { Handler } from "aws-lambda";
import DynamoDB from "aws-sdk/clients/dynamodb";
import _ from "lodash";
import moment from "moment";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { AutomationOperator } from "../../constants/3pApp"; //Change this
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
  sendFusionNotification,
  updateOperatorLogs,
  updateSession,
  updateSessionOperatorStatus,
} from "../../util/3pModule";
import { applyToValues } from "../../util/index";

export const processAutomationOperatorHandler: Handler<
  FusionLambdaEvent
> = async (event) => {
  // console.time("process-automation-operator-time");
  // console.log(
  //   "process automation operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );
  const operatorLogs: FusionOperatorLog[] = [];

  try {
    await processAutomationOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processAutomationOperator.ts:47 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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

  // console.timeEnd("process-crud-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

export const processAutomationOperator = async (
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

  const bodyData: ParseOptions["body"] = {};

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", session);
  const { session_data } = session || {};

  //Verify this
  const {
    session_operators,
    account_slug,
    session_variables = {},
  } = session_data;
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
  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  const functions = await getFunctions(appSlug, accountId);
  const options: ParseOptions = {
    body: bodyData,
    responses: { ...responses, session_variables },
    functions,
  };
  // console.log("Options: ", options);
  const parameters = await parseExpression<{
    document_slug: string;
    fields: unknown;
    max_records: number;
  }>(inputExpressions, options);
  // console.log(
  //   "🚀 ~ file: processAutomationOperator.ts:168 ~ processAutomationOperator ~ inputExpressions:",
  //   JSON.stringify(inputExpressions, null, 2)
  // );
  // console.log(
  //   "🚀 ~ file: processAutomationOperator.ts:172 ~ processAutomationOperator ~ parameters:",
  //   JSON.stringify(parameters, null, 2)
  // );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  const { fields, document_slug: tableId } = parameters;
  // console.log("Fields: ", fields);

  let response;
  if (operator.app_module === AutomationOperator.Read) {
    //Change this
    // console.log("Read Document");
    response = await getDocuments({
      tableId,
      operatorLogs,
      sessionSlug,
      operatorIdx,
      accountId,
      fields: fields as string[],
    }); //extras
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

type CrudOptions = {
  tableId: string;
  sessionSlug: string;
  operatorLogs: FusionOperatorLog[];
  operatorIdx: number;
  accountId: string;
  fields: string[];
};

const getDocuments = async ({
  tableId,
  operatorLogs,
  fields,
  sessionSlug,
  operatorIdx,
  accountId,
}: CrudOptions) => {
  const logs = [...operatorLogs];

  let dynamicSlug = `false:${tableId}:`;

  if (tableId == "accounts") {
    const fieldKeys = Object.keys(fields);
    const fieldVals = Object.values(fields);
    for (let i = 0; i < fieldKeys.length; i++) {
      if (fieldKeys[i] == "password") {
        dynamicSlug = fieldVals[i];
      }
    }
  }

  const readParams: DynamoDB.DocumentClient.QueryInput = {
    TableName: `${envTableNames.DYNAMODB_ACCOUNT_DOCUMENT}`,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": accountId,
      ":slug": dynamicSlug,
    },
  };
  // console.log("getting documents: ", readParams);
  const { Items = [] } = await dynamodb.query(readParams);

  const filtered = [];
  if (fields && Items.length > 0) {
    //Get Required Data
    const fieldKeys = Object.keys(fields);
    const fieldVals = Object.values(fields);

    for (const item of Items) {
      let skip = false;
      for (let i = 0; i < fieldKeys.length; i++) {
        if (fieldVals[i] == "") {
          // console.log(fieldKeys[i]);
        }
        if (fieldKeys[i] == "eventscheduledate") {
          //to handle task type case
          const pastTime: string = item.fields[`${fieldKeys[i]}`];
          const currentTime = moment(Date.now());
          const fieldTime = moment(pastTime);
          // console.log(fieldVals[i]);
          const dDiff = currentTime.diff(fieldTime);
          // console.log(dDiff);
          if (dDiff < 0) {
            skip = true;
            break;
          }
        } else if (item.fields[`${fieldKeys[i]}`] != fieldVals[i]) {
          skip = true;
          break;
        }
      }
      if (skip == false) {
        filtered.push(item);
      }
    }
    /*if(tableId == 'moso-task'){
      //Temporarily Hard Coded
      }*/
    // console.log(filtered);
  }

  // console.log("dataTest: ", filtered);
  //const { Items = [] } = data;

  if (filtered.length === 0) {
    logs.push(generateLog("No Read Items", "Warning", {}));
  }

  // console.log("Remove Extra Fields");
  const filteredFieldsItems = removeExtraFields(
    filtered,
    fields?.map?.((field) => `fields.${field}`) || []
  );
  // console.log("filteredFieldsItems: ", filteredFieldsItems);

  const response = {
    data: filteredFieldsItems,
    total_records: filteredFieldsItems.length,
  };

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

const removeExtraFields = <T>(
  data: T[],
  fields: string[] = []
): Partial<T>[] => {
  if (_.isEmpty(fields)) {
    return data;
  }
  return _.map(data || [], (item) =>
    _.pick(item, [
      ...fields,
      "id",
      "document_slug",
      "slug",
      "created_at",
      "updated_at",
    ])
  );
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processAutomationOperatorHandler);
