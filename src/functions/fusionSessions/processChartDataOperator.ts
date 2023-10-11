import middy from "@middy/core";
import { Handler } from "aws-lambda";
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

type ChartData = Record<string, { _id: string; [x: string]: unknown }[]>;

export const processChartDataOperatorHandler: Handler<
  FusionLambdaEvent
> = async (event) => {
  // console.time("process-chart-data-operator-time");
  // console.log(
  //   "process chart-data system operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );
  const operatorLogs: FusionOperatorLog[] = [];
  try {
    await processChartDataOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processChartDataOperator.ts:44 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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

  // console.timeEnd("process-chart-data-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

export const processChartDataOperator = async (
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

  const { session_operators } = sessionData || {};

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

  const options: ParseOptions = {
    body: {},
    responses,
    functions: gfmlFunctions,
  };

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  // console.log(
  //   "🚀 ~ file: processChartDataOperator.ts:189 ~ processChartDataOperator ~ inputExpressions:",
  //   JSON.stringify(inputExpressions, null, 2)
  // );
  const parameters = await parseExpression<{
    property: string;
    keys: string[];
    data: ChartData;
  }>(inputExpressions, options);
  // console.log(
  //   "🚀 ~ file: processChartDataOperator.ts:191 ~ processChartDataOperator ~ parameters:",
  //   JSON.stringify(parameters, null, 2)
  // );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  const chartData = parameters.data;
  const dataKeys = parameters.keys;
  const dataProperty = parameters.property;

  const response = getChartData(chartData, dataKeys, dataProperty);
  // console.log("Response: ", response);

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
    sessionData,
    queueItem,
    responses: s3Responses,
    operatorLogs,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

const getDatasetsData = (
  chartData: ChartData,
  labels: string[],
  dataKeys: string[],
  property: string
) => {
  const data = dataKeys.reduce<Record<string, unknown[]>>((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});

  labels.forEach((label) => {
    dataKeys.forEach((key) => {
      const dataObj = chartData[key].find((d) => d._id === label);
      const labelData = dataObj ? dataObj[property] || 0 : 0;
      data[key].push(labelData);
    });
  });

  return data;
};

const getChartData = (
  chartData: ChartData,
  keys: string[],
  property: string
) => {
  const labelsArray = keys.reduce<string[]>((acc, key) => {
    const keyData = chartData[key];
    if (!keyData) {
      return acc;
    }

    acc.push(...keyData.map((d) => d._id));
    return acc;
  }, []);

  const labels = [...new Set(labelsArray)]
    .filter(Boolean)
    .sort((a, b) => (a < b ? -1 : 1));

  const data = getDatasetsData(chartData, labels, keys, property);

  return { labels, data };
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processChartDataOperatorHandler);
