import middy from "@middy/core";
import { Handler } from "aws-lambda";
import has from "lodash/has";
import isEmpty from "lodash/isEmpty";
import moment from "moment";
import { v4 } from "uuid";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { FlowControlOperators } from "../../constants/3pApp";
import { FusionType } from "../../enums/fusion";
import { dynamodb } from "../../helpers/db";
import processOperator from "../../helpers/fusion/executeOperator";
import {
  QueueItem,
  insertQueueItems,
} from "../../helpers/fusion/executionQueue";
import { getAvailableCredits } from "../../helpers/fusion/fusionCredit";
import connectKnex from "../../helpers/knex/connect";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import { Fusion, FusionOperator, SessionData } from "../../types/Fusion";
import { ImportChunk } from "../../types/UploadDesign";
import { getAccountItem, sendFusionNotification } from "../../util/3pModule";

type SessionInitializerEvent = {
  fusionSlug: string;
  sessionInitVars?: { [key: string]: any };
  chartInputs?: { [key: string]: any };
  popupVariables?: { [key: string]: any };
  userId: string;
  fusion: Fusion;
  accountId: string;
  importChunk?: ImportChunk;
  chunkIndex?: number;
};

const tableName = envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2;

const lambdaHandler: Handler<SessionInitializerEvent> = async (event) => {
  try {
    console.time("session-init-time");
    console.log(
      "Session initiation lambda hit: ",
      JSON.stringify(event, null, 2)
    );
    const {
      fusion,
      accountId,
      sessionInitVars = {},
      chartInputs = {},
      popupVariables = {},
      userId,
      fusionSlug,
      importChunk,
      chunkIndex,
    } = event;

    //Sort Operators
    const sessionOperators: SessionData["session_operators"] =
      fusion.fusion_operators
        // ?.filter((op) => op.app_module !== "chart-node")
        ?.map((operator) => ({
          ...operator,
          operator_status: "Pending",
          operator_logs: [],
          created_at: moment().format(),
          updated_at: "",
          was_paused: false,
          execution_cycle: 0,
          total_credit_count: 0,
          cycle_credit_count: 0,
        })) || [];
    const startNode = fusion.fusion_operators?.find(
      (operator) => operator.is_start_node
    );

    // const chartData = (fusion.fusion_operators?.find(
    //   (op) => op.app_module === "chart-node"
    // )?.operator_input_settings?.chart_data || {}) as Record<string, unknown>;

    if (!startNode) {
      console.log("No Start Node Found For Fusion: ", JSON.stringify(fusion));
      throw new Error("No Start Node");
    }

    const startNodeSlug = startNode.operator_slug;

    //Delete Extras
    // _.omit(fusion, "id", "slug", "created_at", "updated_at", "is_deleted", "fusion_operators");

    //If Webhook had a payload
    let operatorOutputs: Record<string, any> = {
      sessionInitVars: fusion.fusion_fields?.fields?.reduce((acc, field) => {
        // TODO: validate fields

        acc[field.slug] = sessionInitVars[field.slug] ?? field.default_value;
        return acc;
      }, {} as Record<string, unknown>),
      payload: sessionInitVars?.payload,
      chart_inputs: chartInputs,
      ...popupVariables,
    };
    if (startNode.app === "system" && !isEmpty(sessionInitVars)) {
      operatorOutputs = {
        ...operatorOutputs,
        [startNodeSlug]: sessionInitVars,
      };
    }
    console.log("session init: operator_outputs: ", operatorOutputs);

    //Initialize Session Details
    // let sessionVariables: SessionData["session_variables"] = {};
    // try {
    //   if (fusion.input_vars) {
    //     sessionVariables = fusion.input_vars.map((input) => ({
    //       variable_name: input.name,
    //       variable_type: input.type,
    //       variable_slug: input.slug,
    //       variable_value: sessionInitVars[input.slug],
    //     }));
    //   }
    // } catch (e) {
    //   console.log("Session Int Vars Error: ", e);
    // }

    // const queueId = v4();
    // const queue = {
    //   status: "Processing",
    //   queue: [
    //     {
    //       id: v4(),
    //       operator_id: startNode.slug!,
    //       inputs: startNode.operator_input_settings || {},
    //       responses: {},
    //     },
    //   ],
    // };
    const sessionSlug = `${fusionSlug}:${v4()}`;

    const aggregators =
      fusion.fusion_operators
        ?.filter((op) => op.app_module === FlowControlOperators.ArrayAggregator)
        .reduce<Record<string, any>>((acc, op) => {
          acc[`${op.operator_slug}`] = {
            inputs: [],
            processed_items: 0,
            item_count: 0,
          };

          return acc;
        }, {}) || {};

    const account = await getAccountItem(accountId);
    if (!account?.database_name) {
      throw new Error("Account Database Name Not Found");
    }
    const connection = await connectKnex(account.database_name);
    const availableCredits = await getAvailableCredits(connection);
    const sessionData: SessionData = {
      import_chunk: importChunk,
      chunk_index: chunkIndex,
      fusion_type: fusion.fusion_type,
      session_status: "Building",
      session_init_vars: sessionInitVars,
      account_id: accountId,
      account_slug: accountId,
      user_id: userId,
      session_variables: {},
      session_operators: sessionOperators,
      iterators: {},
      operator_responses: sessionOperators.reduce<
        NonNullable<SessionData["operator_responses"]>
      >((acc, op) => {
        acc[`${op.operator_slug}`] = { operations: [] };
        return acc;
      }, {}),
      // chart_data: chartData,
      aggregators,
      loops: sessionOperators
        .filter(
          (op) => op.app_module === "loop" || op.app_module === "loop_while"
        )
        .map((op) => {
          const loopEnd = sessionOperators.find(
            (o) =>
              o.app_module === "loop_end" &&
              o.operator_input_settings?.loop_slug === op.operator_slug
          )?.operator_slug as string;
          const inLoopOperators = sessionOperators.filter(
            (o) =>
              o.in_loop &&
              o.loop_data?.loop_end_slug === loopEnd &&
              o.loop_data.loop_start_slug === op.operator_slug
          );
          const branchCount =
            1 +
            inLoopOperators.filter(
              (io) =>
                !sessionOperators.find(
                  (o) => o.parent_operator_slug === io.operator_slug
                )
            ).length;
          return {
            loop_start_operator: op.operator_slug as string,
            loop_end_operator: loopEnd,
            total_iterations: 0,
            iteration_index: 0,
            loop_branch_count: branchCount,
            loop_branch_index: 0,
          };
        }),
      aurora_db_name: account?.database_name,
      skill_session_variables: popupVariables.skill_session_variables || {},
      skill_user_variables: popupVariables.skill_user_variables || {},
      error_logs: [],
      start_time: moment.utc().format(),
      skill_responses: {},
      credits_available: availableCredits || 0,
      total_credits_used: 0,
      account_package_id: account.account_package_id,
      parallel_branch_execution: fusion.parallel_branch_execution,
    };
    if (has(fusion, "branch_count") && has(fusion, "operator_count")) {
      sessionData["branch_count"] = fusion.branch_count;
      sessionData["operator_count"] = fusion.operator_count;
    }

    //Insert Session to DB
    const tableParams = {
      TableName: tableName,
      Item: {
        id: `${accountId}:fusion_sessions`,
        slug: sessionSlug,
        fusion_slug: fusionSlug,
        session_data: sessionData,
        is_paused: false,
        is_deleted: false,
        account_id: accountId,
        created_at: moment().format(),
        updated_at: moment().format(),
      },
    };
    console.log(
      "Updating DynamoDB `${accountId}:fusion_sessions`: ",
      tableParams
    );
    console.log("`${accountId}:fusion_sessions` updated successfully!");
    void sendFusionNotification(tableParams.Item);
    //Verify Credits
    // try {
    //   const totalCredits = calculateTotalCredits(fusion.fusion_operators || []);
    //   console.log("checking credits", totalCredits);
    //   const hasCredits = await checkHasCredits(accountId, totalCredits);
    //   console.log(
    //     "🚀 ~ file: sessionInit.ts ~ line 65 ~ constlambdaHandler:Handler<SessionInitializerEvent>= ~ hasCredits",
    //     hasCredits
    //   );
    //   if (!hasCredits) {
    //     // const account = await getAccountItem(tableName);
    //     // const branchCount = fusion.branch_count || 0;
    //     // if (account) {
    //     //   await updateBranches(tableName, accountId, branchCount, "-");
    //     // }
    //     console.log("No Credits");
    //     await updateSessionStatus(sessionSlug, "Failed", accountId, {
    //       message: "Not enough credits",
    //     });
    //     return;
    //   }
    // } catch (e) {
    //   console.log(e);
    //   await updateSessionStatus(sessionSlug, "Failed", accountId, {
    //     message: "Not enough credits",
    //   });
    //   if ((e as Error).message !== "no credit feature") {
    //     throw e;
    //   }
    // }

    await dynamodb.put(tableParams);

    await sendFusionNotification(tableParams.Item);

    const branchId = v4();

    const executionQueue: QueueItem[] = [
      {
        id: sessionSlug,
        slug: `${branchId}:${Date.now().toString()}`,
        operator_id: startNode.operator_slug,
        inputs: startNode.operator_input_settings || {},
        index: 0,
        responses: operatorOutputs,
        branch_id: branchId,
      },
    ];

    console.log("inserting queue item");

    await insertQueueItems(executionQueue);

    // const s3 = await getS3Client();
    // await s3
    //   .putObject({
    //     Bucket: MEDIA_BUCKET_NAME!,
    //     Key: `${accountId}/fusion-sessions/${sessionSlug}/invocation-sequence.json`,
    //     Body: Buffer.from(JSON.stringify([]), "utf8"),
    //   })
    //   .promise();

    console.log("start processing queue item");

    await processOperator({
      accountId,
      // queue,
      // queueId,
      queueItem: executionQueue[0],
      // queueItemPath: "0",
      sessionOperators,
      sessionSlug,
      caller: "sessionInit",
      singleLambda: fusion.fusion_type === FusionType.Skills,
    });

    console.timeEnd("session-init-time");
    console.log("Memory: ", process.memoryUsage());

    return sessionSlug;
  } catch (e) {
    console.log(e);

    if (event.fusion.fusion_type === "import") {
      await dynamodb.update({
        TableName: envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE,
        Key: {
          id: "import-chunk",
          slug: event.importChunk?.slug,
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
      await dynamodb.update({
        TableName: envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS,
        Key: {
          id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
          slug: event.importChunk?.parent_slug,
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
    }
  }
};

function calculateTotalCredits(operators: FusionOperator[]) {
  const final = operators.reduce(function (operators, obj) {
    return operators + obj.total_credit;
  }, 0);
  return final;
}

export const handler = middy().use(mainDbInitializer()).handler(lambdaHandler);
