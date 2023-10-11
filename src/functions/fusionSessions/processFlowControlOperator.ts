import middy from "@middy/core";
import { Handler } from "aws-lambda";
import { isEmpty } from "lodash";
import get from "lodash/get";
import isArray from "lodash/isArray";
import last from "lodash/last";
import moment from "moment";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { FlowControlOperators } from "../../constants/3pApp";
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
  triggerQueueItem,
  updateOperatorOperations,
} from "../../helpers/fusion";
import completeFusionSession from "../../helpers/fusion/completeFusionSession";
import {
  QueueItem,
  getNextQueueItem,
  getNextQueueItems,
  insertQueueItems,
  removeQueueItem,
} from "../../helpers/fusion/executionQueue";
import { performCreditCheck } from "../../helpers/fusion/fusionCredit";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import {
  FilterFieldType,
  FusionLambdaEvent,
  FusionOperatorLog,
  FusionSession,
  OperatorLoop,
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
import { validateCondition } from "../../util/fusion";
import { applyToValues, sleep } from "../../util/index";

export const processFlowControlOperatorHandler: Handler<
  FusionLambdaEvent
> = async (event) => {
  // console.time("process-flow-control-operator-time");
  // console.log(
  //   "process flow control operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );

  const operatorLogs: FusionOperatorLog[] = [];

  try {
    await processFlowControlOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processFlowControlOperator.ts:49 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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
    if (session?.session_data?.import_chunk?.parent_slug) {
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

  // console.timeEnd("process-flow-control-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

type FlowControlOperatorParams = {
  array?: unknown[];
  iterator_slug?: string;
  aggregated_fields?: string[];
  initial?: number;
  repeats?: number;
  steps?: number;
  group_by?: string;
  stop_processing_on_empty_aggregation?: boolean;
  loop_slug?: string;
  condition_sets?: FilterFieldType[];
};

export const processFlowControlOperator = async (
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
  //   "🚀 ~ file: processFlowControlOperator.ts:61 ~ processFlowControlOperator ~ queueItem:",
  //   JSON.stringify(queueItem, null, 2)
  // );

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", session);
  const { session_data } = session || {};

  const { session_operators, session_variables = {} } = session_data || {};

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

  const slugs = session?.session_data?.session_operators
    .map((op) => op.operator_slug)
    .filter(Boolean) as string[];

  const responses = await getPrevOperatorResponses(
    queueItem.inputs,
    s3Responses,
    slugs
  );

  const gfmlFunctions = await getFunctions(appSlug, accountId);

  const options: ParseOptions = {
    body: {},
    responses: { ...responses, session_variables },
    functions: gfmlFunctions,
  };
  console.log(
    "🚀 ~ file: processFlowControlOperator.ts:118 ~ processFlowControlOperator ~ options:",
    JSON.stringify(options, null, 2)
  );
  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  console.log(
    "🚀 ~ file: processFlowControlOperator.ts:122 ~ processFlowControlOperator ~ inputExpressions:",
    JSON.stringify(inputExpressions, null, 2)
  );
  const parameters = await parseExpression<FlowControlOperatorParams>(
    inputExpressions,
    options
  );
  console.log(
    "🚀 ~ file: processFlowControlOperator.ts:127 ~ processFlowControlOperator ~ parameters:",
    JSON.stringify(parameters, null, 2)
  );
  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );
  const { array } = parameters;

  // console.log(
  //   "🚀 ~ file: processFlowControlOperator.ts:135 ~ processFlowControlOperator ~ array:",
  //   JSON.stringify(array, null, 2)
  // );

  if (operator.app_module === FlowControlOperators.ArrayIterator) {
    if (!isArray(array)) {
      const logs = [...operatorLogs];
      logs.push(
        generateLog("Tag Operation", "Failed", {
          reason: "input is not an array",
        })
      );
      await updateOperatorLogs(
        sessionSlug,
        operatorIdx,
        "Failed",
        logs,
        accountId
      );
      return;
    }
    await updateOperatorLogs(
      sessionSlug,
      operatorIdx,
      "Complete",
      operatorLogs,
      accountId
    );

    const aggregatorOps = session_operators.filter(
      (op) =>
        op.app_module === FlowControlOperators.ArrayAggregator &&
        op.operator_input_settings?.iterator_slug === operator.operator_slug
    );

    for (const prevOp of aggregatorOps) {
      await updateSession(
        accountId,
        sessionSlug,
        "SET #sessionData.#aggregators.#operatorSlug.#itemCount = :itemCount",
        {
          ":itemCount": array.length,
        },
        {
          "#sessionData": "session_data",
          "#aggregators": "aggregators",
          "#operatorSlug": prevOp.operator_slug!,
          "#itemCount": "item_count",
        },
        {
          putEvents: false,
        }
      );
    }

    await finalizeOperator({
      accountId,
      sessionSlug,
      operator,
      operationIdx,
      appSlug,
      inputs: parameters,
      outputs: array.map((item, idx, arr) => ({
        value: item,
        array_size: arr.length,
        index: idx,
      })),
      moduleType: "array_iterator",
      sessionData: session_data,
      queueItem,
      responses: s3Responses,
      operatorLogs,
      prevOperatorResponses: responses,
      operatorIdx,
    });
  } else if (operator.app_module === FlowControlOperators.ArrayAggregator) {
    // console.log("Array Aggregator");
    const moduleType = "array_aggregator";
    const {
      group_by,
      aggregated_fields = [],
      stop_processing_on_empty_aggregation = false,
    } = parameters;

    // console.log(
    //   "🚀 ~ file: processFlowControlOperator.ts:242 ~ processFlowControlOperator ~ responses:",
    //   JSON.stringify(responses, null, 2)
    // );
    const data = aggregated_fields.reduce<Record<string, unknown>>(
      (acc, cur) => {
        const value = get({ body: responses }, cur, "");
        const key = last(cur.split(/\[|\]|"/).filter(Boolean));
        if (key) {
          acc[key] = value;
        }

        return acc;
      },
      {}
    );
    // const input: { data: Record<string, unknown>; key?: string } = { data };
    // if (group_by) {
    //   input.key = group_by;
    // }
    const { Attributes } = await updateSession(
      accountId,
      sessionSlug,
      "SET #sessionData.#aggregators.#operatorSlug.#inputs = list_append(#sessionData.#aggregators.#operatorSlug.#inputs, :inputs), #sessionData.#aggregators.#operatorSlug.#processedItems = #sessionData.#aggregators.#operatorSlug.#processedItems + :increment",
      {
        ":inputs": [data],
        ":increment": 1,
      },
      {
        "#sessionData": "session_data",
        "#aggregators": "aggregators",
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
    // console.log(
    //   "🚀 ~ file: processFlowControlOperator.ts:248 ~ processFlowControlOperator ~ processedItems:",
    //   processedItems
    // );
    const itemCount = get(
      Attributes,
      `session_data.aggregators[${operator.operator_slug}].item_count`,
      0
    );
    // console.log(
    //   "🚀 ~ file: processFlowControlOperator.ts:253 ~ processFlowControlOperator ~ itemCount:",
    //   itemCount
    // );
    const inputs = get(
      Attributes,
      `session_data.aggregators[${operator.operator_slug}].inputs`,
      []
    ) as { data: Record<string, unknown> }[];
    // console.log(
    //   "🚀 ~ file: processFlowControlOperator.ts:258 ~ processFlowControlOperator ~ inputs:",
    //   inputs
    // );

    if (processedItems === itemCount) {
      // const inputGroups = groupBy(inputs, "key");
      // // console.log(
      // //   "🚀 ~ file: processFlowControlOperator.ts:261 ~ processFlowControlOperator ~ inputGroups:",
      // //   inputGroups
      // // );
      // const response = Object.entries(inputGroups).map(([key, group]) => {
      //   const aggregatedValue = group.map((item) => item.data);

      //   return {
      //     key,
      //     array: aggregatedValue,
      //   };
      // });
      // console.log(
      //   "🚀 ~ file: processFlowControlOperator.ts:269 ~ response ~ response:",
      //   inputs
      // );

      if (!stop_processing_on_empty_aggregation || inputs.length > 0) {
        await finalizeOperator({
          accountId,
          sessionSlug,
          operator,
          operationIdx,
          appSlug,
          inputs: parameters,
          outputs: { array: inputs },
          moduleType: moduleType as ModuleType,
          sessionData: session_data,
          queueItem,
          responses: s3Responses,
          operatorLogs,
          prevOperatorResponses: responses,
          operatorIdx,
        });
      }
    } else {
      await removeQueueItem(sessionSlug, queueItem.slug);
      const nextQueueItem = await getNextQueueItem(sessionSlug);

      const updatedSession = await getSessionItem(sessionSlug, accountId);
      if (
        !updatedSession?.is_paused &&
        !updatedSession?.is_stopped &&
        nextQueueItem
      ) {
        await triggerQueueItem(
          nextQueueItem,
          accountId,
          updatedSession?.session_data,
          sessionSlug,
          { ...responses },
          queueItem.slug
        );
      }
    }
  } else if (operator.app_module === FlowControlOperators.Repeater) {
    const { initial, repeats, steps } = parameters;

    if (!initial || !repeats) {
      throw new Error("Missing initial or repeats");
    }
    const outputs: Record<string, unknown>[] = [];
    for (let i = 0; i < repeats; i += steps || 1) {
      outputs.push({ i: initial + i });
    }
    await finalizeOperator({
      accountId,
      sessionSlug,
      operator,
      operationIdx,
      appSlug,
      inputs: parameters,
      outputs,
      moduleType: "repeater",
      sessionData: session_data,
      queueItem,
      responses: s3Responses,
      operatorLogs,
      prevOperatorResponses: responses,
      operatorIdx,
    });
  } else if (operator.app_module === FlowControlOperators.Loop) {
    const { iterator_slug } = parameters;
    const dataArray =
      typeof iterator_slug === "string"
        ? (responses[`${iterator_slug}`] as { data: unknown[] })?.data || []
        : iterator_slug;
    // console.log(
    //   "🚀 ~ file: processFlowControlOperator.ts:452 ~ processFlowControlOperator ~ dataArray:",
    //   dataArray?.length,
    //   JSON.stringify(dataArray, null, 2)
    // );

    if (dataArray?.length) {
      await finalizeOperator({
        accountId,
        sessionSlug,
        operator,
        operationIdx,
        appSlug,
        inputs: parameters,
        outputs: dataArray,
        moduleType: "loop",
        sessionData: session_data,
        queueItem,
        responses: s3Responses,
        operatorLogs,
        prevOperatorResponses: responses,
        operatorIdx,
      });
    } else {
      await removeQueueItem(sessionSlug, queueItem.slug);
      const s3Path = await updateOperatorOperations(
        accountId,
        sessionSlug,
        operator.operator_slug!,
        operationIdx,
        {
          status: "Complete",
          inputs: parameters,
          outputs: dataArray,
          logs: operatorLogs,
        }
      );

      await performCreditCheck(
        accountId,
        sessionSlug,
        session_data.aurora_db_name,
        operatorIdx,
        operator.total_credit ?? 1
      );

      await completeFusionSession({
        sessionSlug,
        accountId,
        responses: {
          ...responses,
          [operator.operator_slug!]: {
            responseUrl: s3Path,
          },
        },
      });
      return;
    }
  } else if (operator.app_module === FlowControlOperators.LoopWhile) {
    const { condition_sets } = parameters;

    if (!condition_sets || isEmpty(condition_sets)) {
      throw new Error("Missing condition_sets");
    }

    const isValid = validateWhileConditionSets(condition_sets);
    const response = { condition: isValid };

    if (!isValid) {
      const loopEnd = session_operators.find(
        (o) =>
          o.app_module === "loop_end" &&
          o.operator_input_settings?.loop_slug === operator.operator_slug
      )?.operator_slug as string;

      const childOperators = session_operators.filter(
        (op) => op.parent_operator_slug === loopEnd
      );

      await removeQueueItem(sessionSlug, queueItem.slug);
      const s3Path = await updateOperatorOperations(
        accountId,
        sessionSlug,
        operator.operator_slug!,
        operationIdx,
        {
          status: "Complete",
          inputs: parameters,
          outputs: response,
          logs: operatorLogs,
        }
      );

      await performCreditCheck(
        accountId,
        sessionSlug,
        session_data.aurora_db_name,
        operatorIdx,
        operator.total_credit ?? 1
      );

      if (!childOperators.length) {
        await completeFusionSession({
          sessionSlug,
          accountId,
          responses: {
            ...responses,
            [operator.operator_slug!]: {
              responseUrl: s3Path,
            },
          },
        });
        return;
      }

      const queueItems: QueueItem[] = [];
      for (const child of childOperators.reverse()) {
        queueItems.push({
          id: sessionSlug,
          slug: Date.now().toString(),
          operator_id: child.operator_slug!,
          inputs: child.operator_input_settings || {},
          index: queueItem.index,
          responses: {
            ...s3Responses,
            [operator.operator_slug!]: {
              responseUrl: s3Path,
            },
          },
        });
        await sleep(1);
      }

      await insertQueueItems(queueItems);
      const nextQueueItem = await getNextQueueItem(sessionSlug);

      if (!session?.is_paused && !session?.is_stopped && nextQueueItem) {
        await triggerQueueItem(
          nextQueueItem,
          accountId,
          session_data,
          sessionSlug,
          {
            ...responses,
            [operator.operator_slug!]: response,
          },
          queueItem.slug
        );
      }
    } else {
      await finalizeOperator({
        accountId,
        sessionSlug,
        operator,
        operationIdx,
        appSlug,
        inputs: parameters,
        outputs: response,
        moduleType: "loop_while",
        sessionData: session_data,
        queueItem,
        responses: s3Responses,
        operatorLogs,
        prevOperatorResponses: responses,
        operatorIdx,
      });
    }
  } else if (operator.app_module === FlowControlOperators.LoopEnd) {
    const { loop_slug } = parameters;

    const loopOperator = session_operators.find(
      (op) => op.operator_slug === loop_slug
    );
    const isLoopWhile =
      loopOperator?.app_module === FlowControlOperators.LoopWhile;

    const loopIndex =
      session_data?.loops?.findIndex(
        (l) =>
          l.loop_end_operator === operator.operator_slug &&
          l.loop_start_operator === loop_slug
      ) ?? -1;

    if (loopIndex === -1) {
      throw new Error("Loop not found");
    }

    const biUpdate = await updateSession(
      accountId,
      sessionSlug,
      `SET session_data.loops[${loopIndex}].loop_branch_index = session_data.loops[${loopIndex}].loop_branch_index + :inc`,
      {
        ":inc": 1,
      },
      {},
      {
        putEvents: false,
      }
    );

    const biUpdateLoopData = get(
      biUpdate.Attributes,
      `session_data.loops[${loopIndex}]`
    ) as OperatorLoop;

    if (isLoopWhile) {
      if (
        biUpdateLoopData.loop_branch_index >= biUpdateLoopData.loop_branch_count
      ) {
        await updateSession(
          accountId,
          sessionSlug,
          `SET session_data.loops[${loopIndex}].loop_branch_index = :idx`,
          {
            ":idx": 0,
          },
          {},
          {
            putEvents: false,
          }
        );

        const response = {};
        await removeQueueItem(sessionSlug, queueItem.slug);
        const s3Path = await updateOperatorOperations(
          accountId,
          sessionSlug,
          operator.operator_slug!,
          operationIdx,
          {
            status: "Complete",
            inputs: parameters,
            outputs: response,
            logs: operatorLogs,
          }
        );

        await performCreditCheck(
          accountId,
          sessionSlug,
          session_data.aurora_db_name,
          operatorIdx,
          operator.total_credit ?? 1
        );

        await insertQueueItems([
          {
            id: sessionSlug,
            slug: Date.now().toString(),
            operator_id: loopOperator.operator_slug!,
            inputs: loopOperator.operator_input_settings || {},
            index: queueItem.index,
            responses: {
              ...s3Responses,
              [operator.operator_slug!]: {
                responseUrl: s3Path,
              },
            },
          },
        ]);

        const nextQueueItem = await getNextQueueItem(sessionSlug);

        if (!session?.is_paused && !session?.is_stopped && nextQueueItem) {
          await triggerQueueItem(
            nextQueueItem,
            accountId,
            session_data,
            sessionSlug,
            {
              ...responses,
              [operator.operator_slug!]: response,
            },
            queueItem.slug
          );
        }
      } else {
        const s3Path = await updateOperatorOperations(
          accountId,
          sessionSlug,
          operator.operator_slug!,
          operationIdx,
          {
            status: "Complete",
            inputs: parameters,
            outputs: {},
            logs: operatorLogs,
          }
        );
        await removeQueueItem(sessionSlug, queueItem.slug);
        await performCreditCheck(
          accountId,
          sessionSlug,
          session_data.aurora_db_name,
          operatorIdx,
          operator.total_credit ?? 1
        );
        if (!session_data.parallel_branch_execution) {
          const nextQueueItem = await getNextQueueItem(sessionSlug);

          const updatedSession = await getSessionItem(sessionSlug, accountId);
          if (!nextQueueItem) {
            await completeFusionSession({
              sessionSlug,
              accountId,
              responses: {
                ...responses,
                [operator.operator_slug!]: {
                  responseUrl: s3Path,
                },
              },
            });
            return;
          } else if (
            !updatedSession?.is_paused &&
            !updatedSession?.is_stopped &&
            nextQueueItem
          ) {
            await triggerQueueItem(
              nextQueueItem,
              accountId,
              updatedSession?.session_data,
              sessionSlug,
              { ...responses },
              queueItem.slug
            );
          }
        }
      }

      return;
    }

    const moduleType = "loop";

    if (
      biUpdateLoopData.loop_branch_index >= biUpdateLoopData.loop_branch_count
    ) {
      await updateSession(
        accountId,
        sessionSlug,
        `SET session_data.loops[${loopIndex}].loop_branch_index = :idx`,
        {
          ":idx": 0,
        },
        {},
        {
          putEvents: false,
        }
      );

      const { Attributes } = await updateSession(
        accountId,
        sessionSlug,
        `SET session_data.loops[${loopIndex}].iteration_index = session_data.loops[${loopIndex}].iteration_index + :inc`,
        {
          ":inc": 1,
        },
        {},
        {
          putEvents: false,
        }
      );

      const updatedLoopData = get(
        Attributes,
        `session_data.loops[${loopIndex}]`
      );

      if (updatedLoopData.iteration_index >= updatedLoopData.total_iterations) {
        await finalizeOperator({
          accountId,
          sessionSlug,
          operator,
          operationIdx,
          appSlug,
          inputs: parameters,
          outputs: {},
          moduleType: moduleType as ModuleType,
          sessionData: session_data,
          queueItem,
          responses: s3Responses,
          operatorLogs,
          prevOperatorResponses: responses,
          operatorIdx,
        });
      } else {
        await removeQueueItem(sessionSlug, queueItem.slug);
        const updatedSession = Attributes as FusionSession;
        const s3Path = await updateOperatorOperations(
          accountId,
          sessionSlug,
          operator.operator_slug!,
          operationIdx,
          {
            status: "Complete",
            inputs: parameters,
            outputs: {},
            logs: operatorLogs,
          }
        );

        await performCreditCheck(
          accountId,
          sessionSlug,
          session_data.aurora_db_name,
          operatorIdx,
          operator.total_credit ?? 1
        );

        const nextItemsToExecute: QueueItem[] = [];

        if (session_data.parallel_branch_execution) {
          const iterationIdx = queueItem.branch_id?.split(":")[0] || "";
          const nextQueueItems = await getNextQueueItems(
            sessionSlug,
            iterationIdx
          );

          nextQueueItems.push(...nextQueueItems);
        } else {
          const nextQueueItem = await getNextQueueItem(sessionSlug);
          if (!nextQueueItem) {
            await completeFusionSession({
              sessionSlug,
              accountId,
              responses: {
                ...responses,
                [operator.operator_slug!]: {
                  responseUrl: s3Path,
                },
              },
            });
            return;
          }
          nextItemsToExecute.push(nextQueueItem);
        }

        if (
          !updatedSession?.is_paused &&
          !updatedSession?.is_stopped &&
          nextItemsToExecute.length > 0
        ) {
          for (const nextQueueItem of nextItemsToExecute) {
            await triggerQueueItem(
              nextQueueItem,
              accountId,
              updatedSession?.session_data,
              sessionSlug,
              { ...responses },
              queueItem.slug
            );
          }
        }
      }
    } else {
      const s3Path = await updateOperatorOperations(
        accountId,
        sessionSlug,
        operator.operator_slug!,
        operationIdx,
        {
          status: "Complete",
          inputs: parameters,
          outputs: {},
          logs: operatorLogs,
        }
      );
      await removeQueueItem(sessionSlug, queueItem.slug);
      await performCreditCheck(
        accountId,
        sessionSlug,
        session_data.aurora_db_name,
        operatorIdx,
        operator.total_credit ?? 1
      );
      if (!session_data.parallel_branch_execution) {
        const nextQueueItem = await getNextQueueItem(sessionSlug);

        const updatedSession = await getSessionItem(sessionSlug, accountId);
        if (!nextQueueItem) {
          await completeFusionSession({
            sessionSlug,
            accountId,
            responses: {
              ...responses,
              [operator.operator_slug!]: {
                responseUrl: s3Path,
              },
            },
          });
          return;
        } else if (
          !updatedSession?.is_paused &&
          !updatedSession?.is_stopped &&
          nextQueueItem
        ) {
          await triggerQueueItem(
            nextQueueItem,
            accountId,
            updatedSession?.session_data,
            sessionSlug,
            { ...responses },
            queueItem.slug
          );
        }
      }
    }
  }
};

const validateWhileConditionSets = (conditionSets: FilterFieldType[]) => {
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

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processFlowControlOperatorHandler);
