import middy from "@middy/core";
import { Handler } from "aws-lambda";
import get from "lodash/get";
import groupBy from "lodash/groupBy";
import isNumber from "lodash/isNumber";
import isString from "lodash/isString";
import maxBy from "lodash/maxBy";
import minBy from "lodash/minBy";
import sumBy from "lodash/sumBy";
import toNumber from "lodash/toNumber";
import moment from "moment";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { BasicSystemOperators, FusionLambda } from "../../constants/3pApp";
import { ModuleType } from "../../enums/3pApp";
import { InvocationType } from "../../enums/lambda";
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
import { QueueItem } from "../../helpers/fusion/executionQueue";
import { invokeLambda } from "../../helpers/lambda";
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
  updateSessionVariables,
} from "../../util/3pModule";
import { getFusion } from "../../util/fusion";
import { applyToValues, sleep } from "../../util/index";

export const processBasicSystemOperatorHandler: Handler<
  FusionLambdaEvent
> = async (event) => {
  // console.time("process-basic-system-operator-time");
  console.log(
    "process basic system operators lambda hit: ",
    JSON.stringify(event, null, 2)
  );

  const operatorLogs: FusionOperatorLog[] = [];
  try {
    await processBasicSystemOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processBasicSystemOperator.ts:58 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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

  // console.timeEnd("process-basic-system-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

type BasicSystemOperatorParams = {
  name?: string;
  variables?: unknown[];
  value?: unknown;
  delay?: number;
  bundles?: Record<string, unknown>[];
  text?: string;
  source?: string;
  input?: string;
  regex?: boolean;
  cases?: { pattern: string; output: string }[];
  default_case?: string;
  reset?: string;
  row_separator?: string;
  custom_row_separator?: string;
  column_separator?: string;
  custom_column_separator?: string;
  group_by?: string;
  aggregate_function?: "avg" | "sum" | "min" | "max" | "count";
  aggregated_fields?: string[];
  stop_processing_on_empty_aggregation?: boolean;
  fusion_slug?: string;
};

export const processBasicSystemOperator = async (
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
  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:89 ~ processBasicSystemOperator ~ queueItem:",
  //   JSON.stringify(queueItem, null, 2)
  // );

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

  // const {
  //   name: rawName,
  //   value: rawValue,
  //   variables: rawVariables,
  // } = operator.operator_input_settings || {};

  const extraResponses = [];
  if (isString(queueItem.inputs.source)) {
    extraResponses.push(queueItem.inputs.source);
  }
  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:146 ~ processBasicSystemOperator ~ extraResponses:",
  //   JSON.stringify(extraResponses, null, 2)
  // );
  const responses = await getPrevOperatorResponses(
    queueItem.inputs,
    s3Responses,
    extraResponses
  );
  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:154 ~ processBasicSystemOperator ~ responses:",
  //   JSON.stringify(responses, null, 2)
  // );

  const gfmlFunctions = await getFunctions(appSlug, accountId);

  const options: ParseOptions = {
    body: { ...responses, session_variables },
    responses: { ...responses, session_variables },
    functions: gfmlFunctions,
  };
  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:162 ~ processBasicSystemOperator ~ options:",
  //   JSON.stringify(options, null, 2)
  // );

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  console.log(
    "🚀 ~ file: processBasicSystemOperator.ts:168 ~ processBasicSystemOperator ~ inputExpressions:",
    JSON.stringify(inputExpressions, null, 2),
    JSON.stringify(gfmlFunctions, null, 2)
  );
  const parameters = await parseExpression<BasicSystemOperatorParams>(
    inputExpressions,
    options
  );
  console.log(
    "🚀 ~ file: processBasicSystemOperator.ts:173 ~ processBasicSystemOperator ~ parameters:",
    JSON.stringify(parameters, null, 2)
  );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  const {
    name,
    value,
    variables,
    delay,
    bundles,
    stop_processing_on_empty_aggregation = false,
  } = parameters;

  let response: any = {},
    moduleType: string = ModuleType.Action;
  // console.log("Session Variables: ", session_variables);
  switch (operator.app_module) {
    case BasicSystemOperators.SetVariable: {
      // console.log("Set Variable");
      if (!name) {
        throw new Error("variable name is required");
      }
      let v = value;
      if (isString(v)) {
        try {
          v = JSON.parse(v);
        } catch (e) {
          v = value;
        }
      }
      response = {
        [name]: v,
      };
      session_variables[name] = v;
      operatorLogs.push(generateLog("Set Variable", "Success", response));
      break;
    }
    case BasicSystemOperators.SetMultipleVariables: {
      // console.log("Set Multiple Variables");
      response = (variables as { name: string; value: unknown }[]).reduce<
        Record<string, unknown>
      >((acc, { name, value }) => {
        let v = value;
        if (isString(v)) {
          try {
            v = JSON.parse(v);
          } catch (e) {
            v = value;
          }
        }
        acc[name] = v;
        session_variables[name] = v;
        return acc;
      }, {});
      operatorLogs.push(generateLog("Set Variables", "Success", response));
      break;
    }
    case BasicSystemOperators.GetVariable:
      // console.log("Get Variable");
      if (!name) {
        throw new Error("variable name is required");
      }
      response = {
        [name]: session_variables[name],
      };
      operatorLogs.push(generateLog("Get Variable", "Success", response));
      break;
    case BasicSystemOperators.GetMultipleVariables: {
      // console.log("Get Multiple Variables");
      response = (variables as { value: string }[]).reduce<
        Record<string, unknown>
      >((acc, { value: name }) => {
        acc[name] = session_variables[name];
        return acc;
      }, {});
      // console.log(JSON.stringify(response, null, 2));
      operatorLogs.push(generateLog("Get Variables", "Success", response));
      break;
    }
    case BasicSystemOperators.Sleep: {
      if (!delay || delay < 0 || delay > 300) {
        throw new Error("Invalid delay value");
      }
      await sleep(delay * 1000);
      break;
    }
    case BasicSystemOperators.BasicTrigger: {
      response = bundles;
      moduleType = "basic_trigger";
      break;
    }
    case BasicSystemOperators.ComposeString: {
      const { text } = parameters;
      response = {
        text,
      };
      break;
    }
    case BasicSystemOperators.Switch: {
      const { input, regex = false, cases, default_case } = parameters;
      if (!input) {
        throw new Error("input is required");
      }

      if (regex) {
        response = cases?.find((c) => {
          const expression = new RegExp(c.pattern);
          return expression.test(input);
        })?.output;
      } else {
        response = cases?.find((c) => {
          return c.pattern === input;
        })?.output;
      }

      if (!response) {
        response = default_case;
      }
      break;
    }
    case BasicSystemOperators.IncrementFunction: {
      const { Attributes = {} } = await dynamodb.update({
        TableName: envTableNames.DYNAMODB_ACCT_FUSION_FLOWS,
        Key: {
          id: `${accountId}:fusion_flows`,
          slug: session.fusion_slug,
        },
        UpdateExpression:
          "SET #incrementFunctions.#operatorSlug.#value = #incrementFunctions.#operatorSlug.#value + :increment",
        ExpressionAttributeNames: {
          "#incrementFunctions": "increment_functions",
          "#operatorSlug": operator.operator_slug!,
          "#value": "i",
        },
        ExpressionAttributeValues: {
          ":increment": 1,
        },
        ReturnValues: "UPDATED_NEW",
      });

      response = {
        i: Attributes.increment_functions[operator.operator_slug!].i,
      };
      break;
    }
    case BasicSystemOperators.TextAggregator: {
      moduleType = "text_aggregator";
      const { text, row_separator, group_by, custom_row_separator } =
        parameters;

      const input: { text: string; key?: string } = { text: text || "" };
      if (group_by) {
        input.key = group_by;
      }
      const { Attributes } = await updateSession(
        accountId,
        sessionSlug,
        "SET #sessionData.#aggregators.#operatorSlug.#inputs = list_append(#sessionData.#aggregators.#operatorSlug.#inputs, :inputs), #sessionData.#aggregators.#operatorSlug.#processedItems = #sessionData.#aggregators.#operatorSlug.#processedItems + :increment",
        {
          ":inputs": [input],
          ":increment": 1,
        },
        {
          "#sessionData": "session_data",
          "#aggregators": "session_data.aggregators",
          "#operatorSlug": operator.operator_slug!,
          "#inputs": "inputs",
          "#processedItems": "processed_items",
        },
        { putEvents: false }
      );
      const processedItems = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].processed_items`,
        0
      );
      const itemCount = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].item_count`,
        0
      );
      const inputs = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].inputs`,
        []
      ) as { text: string }[];

      if (processedItems === itemCount) {
        const separator =
          row_separator === "other" ? custom_row_separator : row_separator;
        const inputGroups = groupBy(inputs, "key");
        response = Object.entries(inputGroups).map(([key, group]) => {
          const aggregatedValue = group.reduce((acc, { text }, idx, arr) => {
            acc += `${text}`;

            if (idx < arr.length - 1) {
              acc += separator;
            }

            return acc;
          }, "");

          return {
            key,
            text: aggregatedValue,
          };
        });
      }

      break;
    }
    case BasicSystemOperators.NumericAggregator: {
      moduleType = "numeric_aggregator";
      const { value: rawValue, group_by, aggregate_function } = parameters;

      const value = toNumber(rawValue);
      if (!isNumber(value)) {
        throw new Error("Invalid numeric value");
      }

      const input: { value: number; key?: string } = { value };
      if (group_by) {
        input.key = group_by;
      }
      const { Attributes } = await updateSession(
        accountId,
        sessionSlug,
        "SET #sessionData.#aggregators.#operatorSlug.#inputs = list_append(#sessionData.#aggregators.#operatorSlug.#inputs, :inputs), #sessionData.#aggregators.#operatorSlug.#processedItems = #sessionData.#aggregators.#operatorSlug.#processedItems + :increment",
        {
          ":inputs": [input],
          ":increment": 1,
        },
        {
          "#sessionData": "session_data",
          "#aggregators": "session_data.aggregators",
          "#operatorSlug": operator.operator_slug!,
          "#inputs": "inputs",
          "#processedItems": "processed_items",
        },
        { putEvents: false }
      );
      const processedItems = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].processed_items`,
        0
      );
      const itemCount = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].item_count`,
        0
      );
      const inputs = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].inputs`,
        []
      ) as { value: number }[];

      if (processedItems === itemCount) {
        const inputGroups = groupBy(inputs, "key");
        response = Object.entries(inputGroups).map(([key, group]) => {
          let aggregatedValue;
          switch (aggregate_function) {
            case "sum":
              aggregatedValue = sumBy(group, "value");
              break;
            case "avg":
              aggregatedValue = sumBy(group, "value") / group.length;
              break;
            case "max":
              aggregatedValue = maxBy(group, "value");
              break;
            case "min":
              aggregatedValue = minBy(group, "value");
              break;
            case "count":
              aggregatedValue = group.reduce(
                (acc, item) => acc + item.value,
                0
              );
              break;
            default:
              throw new Error("Invalid aggregate function");
          }

          return {
            key,
            value: aggregatedValue,
          };
        });
      }

      break;
    }
    case BasicSystemOperators.TableAggregator: {
      moduleType = "table_aggregator";
      const {
        row_separator,
        column_separator,
        group_by,
        custom_row_separator,
        custom_column_separator,
        aggregated_fields,
      } = parameters;

      const colSeparator =
        column_separator === "other"
          ? custom_column_separator
          : column_separator;
      const rowValues = aggregated_fields?.reduce((acc, cur, idx, arr) => {
        const cellValue = get(responses, cur, "");
        acc += cellValue;

        if (idx < arr.length - 1) {
          acc += colSeparator;
        }

        return acc;
      }, "");
      const input: { text: string; key?: string } = { text: rowValues || "" };
      if (group_by) {
        input.key = group_by;
      }
      const { Attributes } = await updateSession(
        accountId,
        sessionSlug,
        "SET #sessionData.#aggregators.#operatorSlug.#inputs = list_append(#sessionData.#aggregators.#operatorSlug.#inputs, :inputs), #sessionData.#aggregators.#operatorSlug.#processedItems = #sessionData.#aggregators.#operatorSlug.#processedItems + :increment",
        {
          ":inputs": [input],
          ":increment": 1,
        },
        {
          "#sessionData": "session_data",
          "#aggregators": "session_data.aggregators",
          "#operatorSlug": operator.operator_slug!,
          "#inputs": "inputs",
          "#processedItems": "processed_items",
        },
        { putEvents: false }
      );
      const processedItems = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].processed_items`,
        0
      );
      const itemCount = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].item_count`,
        0
      );
      const inputs = get(
        Attributes,
        `session_data.aggregators[${operator.operator_slug}].inputs`,
        []
      ) as { text: string }[];

      if (processedItems === itemCount) {
        const separator =
          row_separator === "other" ? custom_row_separator : row_separator;
        const inputGroups = groupBy(inputs, "key");
        response = Object.entries(inputGroups).map(([key, group]) => {
          const aggregatedValue = group.reduce((acc, { text }, idx, arr) => {
            acc += `${text}`;

            if (idx < arr.length - 1) {
              acc += separator;
            }

            return acc;
          }, "");

          return {
            key,
            text: aggregatedValue,
          };
        });
      }

      break;
    }
    case BasicSystemOperators.TriggerFusion: {
      const { fusion_slug } = parameters;

      if (!fusion_slug) {
        throw new Error("Fusion parameter must be provided");
      }

      const fusion = await getFusion(fusion_slug, accountId);

      if (!fusion) {
        throw new Error("Fusion not found");
      }

      const lambdaResponse = await invokeLambda(
        FusionLambda.SessionInt,
        {
          fusionSlug: fusion_slug,
          fusion,
          accountId: fusion.account_id,
          userId: sessionData.user_id,
          popupVariables: {},
        },
        InvocationType.RequestResponse,
        { roundRobin: true }
      );

      let sessionSlug = "";

      try {
        sessionSlug = JSON.parse(lambdaResponse.Payload as string);
      } catch (e) {
        console.log(lambdaResponse.Payload);
        console.log(e);
      }

      if (!sessionSlug) {
        throw new Error("Fusion could not be started");
      }

      response = {
        session_slug: sessionSlug,
      };

      break;
    }
    default:
      console.log("Invalid App Module: Skipping");
  }
  // console.log("updateSessionVariables: ", session_variables);
  await updateSessionVariables(sessionSlug, session_variables, accountId);
  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:744 ~ processBasicSystemOperator ~ ress:",
  //   JSON.stringify(ress, null, 2)
  // );
  // console.log("updatedSessionVariables: ", session_variables);

  await updateOperatorLogs(
    sessionSlug,
    operatorIdx,
    "Complete",
    operatorLogs,
    accountId
  );

  console.log(
    "🚀 ~ file: processBasicSystemOperator.ts:677 ~ processBasicSystemOperator ~ response:",
    JSON.stringify(response, null, 2)
  );
  if (
    !stop_processing_on_empty_aggregation ||
    (response?.length && response.length > 0)
  ) {
    await finalizeOperator({
      accountId,
      sessionSlug,
      operator,
      operationIdx,
      appSlug,
      inputs: parameters,
      outputs: response,
      moduleType: moduleType as ModuleType,
      sessionData,
      queueItem,
      responses: s3Responses,
      operatorLogs,
      prevOperatorResponses: responses,
      operatorIdx,
    });
  }
};

const updateSessionVarsInExecutionQueue = (
  queue: QueueItem[],
  sessionVars: Record<string, unknown>,
  updateKey = "sessionInitVars"
): QueueItem[] => {
  return queue.map((q) => {
    const responses = Object.entries(q.responses?.[updateKey] || {}).reduce(
      (acc, [key, value]) => {
        acc[key] = sessionVars[key] ?? value;
        return acc;
      },
      (q.responses?.[updateKey] || {}) as Record<string, unknown>
    );

    return {
      ...q,
      responses,
      // branches: updateSessionVarsInExecutionQueue(
      //   q.branches || [],
      //   sessionVars,
      //   updateKey
      // ),
    } as QueueItem;
  });
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processBasicSystemOperatorHandler);
