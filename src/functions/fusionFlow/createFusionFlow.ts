import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Fusion } from "types";
import { v4 as uuidv4, v4 } from "uuid";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const fusionFlowTableName = `${envTableNames.DYNAMODB_ACCT_FUSION_FLOWS}`;
const fusionFlowHistoryTableName = `${envTableNames.DYNAMODB_ACCT_FUSION_FLOW_HISTORY}`;

export const RequsetCreateFusionFlowBody = {
  title: "RequsetCreateFusionFlowBody",
  RequsetCreateFusionFlowBody: eventSchema.properties.body,
};

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const body = event.body as Fusion & {
      event_slug?: string;
      event_source_slug?: string;
    };
    const accountId: string = event.headers["account-id"] as string;

    const slug = `${body.parent_type ?? 0}:${uuidv4()}`;

    const { Item } = await dynamodb
      .get({
        TableName: fusionFlowTableName,
        Key: {
          id: `${accountId}:fusion_flows`,
          slug: slug,
        },
      })
      .promise();
    if (Item) {
      throw createHttpError(400, new Error("Slug Already exists"), {
        expose: true,
      });
    }

    const now = new Date().toISOString();
    let operator_count = 0;
    if (["line", "pie", "bar", "stats"].includes(`${body.fusion_type}`)) {
      body.fusion_operators = [
        {
          app: "system",
          app_module: "widget-start-operator",
          parent_fusion_id: slug,
          is_start_node: true,
          operator_title: "Start Node",
          operator_slug: v4(),
          total_credit: 1,
        },
      ];
      operator_count = 1;
    } else if (body.fusion_type === "webhook") {
      body.fusion_operators = [
        {
          app: "system",
          app_module: "webhook",
          parent_fusion_id: slug,
          is_start_node: true,
          operator_title: "Inbound Webhook",
          operator_slug: v4(),
          total_credit: 1,
        },
      ];
      operator_count = 1;
    } else if (body.fusion_type === "import") {
      body.fusion_operators = [
        {
          app: "system",
          app_module: "import",
          parent_fusion_id: slug,
          is_start_node: true,
          operator_title: "Importer",
          operator_slug: v4(),
          total_credit: 1,
        },
      ];
      operator_count = 1;
    } else if (body.fusion_type === "event") {
      body.fusion_operators = [
        {
          app: "system",
          app_module: "event",
          parent_fusion_id: slug,
          is_start_node: true,
          operator_title: "Event",
          operator_slug: v4(),
          total_credit: 1,
        },
      ];
    }

    const fusionItem: Fusion = {
      id: `${accountId}:fusion_flows`,
      slug: slug,
      account_id: accountId,
      fusion_title: body.fusion_title,
      fusion_type: body.fusion_type,
      fusion_tags: body.fusion_tags,
      input_vars: body.input_vars || [],
      output_vars: body.output_vars,
      schedule_type: body.schedule_type,
      minute_count: body.minute_count,
      days_of_week: body.days_of_week,
      date_of_month: body.date_of_month,
      dataset_slug: body.dataset_slug,
      fusion_status: body.fusion_status,
      socket_session_id: body.socket_session_id,
      socket_session_metadata: body.socket_session_metadata,
      max_duration: body.max_duration,
      message_success: body.message_success,
      fusion_operators: body.fusion_operators || [],
      operator_count,
      branch_count: 1,
      parent_type: body.parent_type ?? 0,
      parent_id: body.parent_id ?? 0,
      is_active: body.is_active ? 1 : 0,
      is_deleted: 0,
      created_at: new Date().toISOString(),
      updated_at: null,
    };

    const tableParams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: fusionFlowTableName,
      Item: fusionItem,
    };
    if (body.fusion_type === "event") {
      //Fusion Extras
      tableParams.Item["event_slug"] = body.event_slug;
      tableParams.Item["event_source_slug"] = body.event_source_slug;
      // tableParams.Item["user_id"] = `${await userId(
      //   req.tableName,
      //   req.headers.authorization,
      // )}`;

      tableParams.Item.input_vars = [
        makeInputVar("event_slug", "string", "event_slug"),
        makeInputVar("event_source_slug", "string", "event_source_slug"),
        makeInputVar("system_user_id", "string", "system_user_id"),
        makeInputVar("event_date_time", "string", "event_date_time"),
        makeInputVar("event_meta_data", "json", "event_meta_data"),
      ];
      console.log("Additional event params success!");
    }
    await dynamodb.put(tableParams).promise();

    const tableParamsHistory = {
      TableName: fusionFlowHistoryTableName,
      Item: {
        id: `${accountId}:fusion_flows_history`,
        slug: `${slug}:${Date.parse(now)}`,
        account_id: accountId,
        fusion_title: body.fusion_title,
        fusion_type: body.fusion_type,
        fusion_tags: body.fusion_tags,
        input_vars: body.input_vars,
        output_vars: body.output_vars,
        schedule_type: body.schedule_type,
        minute_count: body.minute_count,
        days_of_week: body.days_of_week,
        date_of_month: body.date_of_month,
        dataset_slug: body.dataset_slug,
        fusion_status: body.fusion_status,
        socket_session_id: body.socket_session_id,
        socket_session_metadata: body.socket_session_metadata,
        max_duration: body.max_duration,
        message_success: body.message_success,
        fusion_operators: body.fusion_operators || [],
        version: 1,
        operator_count,
        branch_count: 1,
        is_active: body.is_active ?? false,
        is_deleted: 0,
        created_at: now,
        updated_at: now,
      },
    };
    await dynamodb.put(tableParamsHistory).promise();

    return {
      statusCode: 200,
      body: {
        data: tableParams.Item,
      },
    };
  } catch (e) {
    throw createHttpError(400, e as Error, { expose: true });
  }
};

const makeInputVar = (name: string, type: string, slug: string) => ({
  name: name,
  type: type,
  slug: slug,
});

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(
    httpResponseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }: any) => JSON.stringify(body),
        },
      ],
      defaultContentType: "application/json",
    })
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
