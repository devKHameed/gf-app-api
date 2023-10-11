import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import { v4 } from "uuid";
import {
  ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { AccountUser, FusionOperator } from "../../types";
import { createFusion } from "../../util/fusion";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const TABLE_NAME = envTableNames.DYNAMODB_GF_DASHBOARD_WIDGETS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        parent_gui_id: {
          type: "string",
        },
        parent_tab_id: {
          type: "string",
        },
        name: {
          type: "string",
        },
        widget_type: {
          type: "string",
        },
        row_id: {
          type: "string",
        },
        row_column: {
          type: "number",
        },
        filter_groups: {
          type: "array",
          default: [],
        },
        description: {
          type: "string",
        },
        dummy_data_titles: {
          type: "object",
          default: {},
        },
      },
      required: [
        "row_id",
        "row_column",
        "parent_gui_id",
        "parent_tab_id",
        "name",
        "widget_type",
      ], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const {
    parent_gui_id,
    parent_tab_id,
    name,
    widget_type,
    row_id,
    row_column,
    filter_groups,
    description,
    dummy_data_titles,
  } = event.body;

  const accountId: string = event.headers["account-id"] as string;

  const user = event.user as AccountUser;

  if (!user) {
    throw createError(401, "Unauthorized");
  }

  const isDeleted = 0;
  const slug = `${isDeleted}:${parent_gui_id}:${parent_tab_id}:${v4()}`;
  const startOperator: FusionOperator = {
    app: "system",
    operator_subtitle: "System Module",
    is_start_node: true,
    parent_fusion_id: slug,
    total_credit: 1,
    operator_title: "Start Widget Module",
    app_module: "widget-start-operator",
    operator_slug: `widget-start-operator_${v4()}`,
    app_id: "system",
  };
  const chartOperator: FusionOperator = {
    app: "system",
    app_id: "system",
    app_module: "chart-node",
    operator_slug: v4(),
    operator_subtitle: "System Module",
    is_start_node: false,
    parent_fusion_id: slug,
    parent_operator_slug: startOperator.operator_slug,
    total_credit: 1,
    operator_title: "",
  };
  switch (widget_type) {
    case "stat":
      chartOperator.operator_title = "Stat Widget";
      break;
    case "pie":
      chartOperator.operator_title = "Pie Chart";
      break;
    case "bar":
      chartOperator.operator_title = "Bar Chart";
      break;
    case "line":
      chartOperator.operator_title = "Line Chart";
      break;
    case "data-list":
      chartOperator.operator_title = "Data List Widget";
      break;
    default:
      break;
  }
  const startNodeId = v4();
  const chartNodeId = v4();
  const fusion = await createFusion(accountId, {
    fusion_slug: slug,
    fusion_title: name,
    fusion_description: "Fusion for " + name + " Dashboard Widget",
    fusion_type: widget_type,
    fusion_operators: [startOperator, chartOperator],
    flow: {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          height: 100,
          width: 100,
          id: startNodeId,
          type: "flow-node",
          position: { x: 300, y: 150 },
          data: startOperator,
        },
        {
          height: 100,
          width: 100,
          id: chartNodeId,
          type: "flow-node",
          position: { x: 300, y: 370 },
          data: chartOperator,
        },
      ],
      edges: [
        {
          id: `e${startNodeId}-${chartNodeId}`,
          data: {
            type: "chart-edge",
          },
          source: startNodeId,
          target: chartNodeId,
          type: "flow-edge",
        },
      ],
    },
  });
  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: {
      id: `${accountId}:${ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME}`,
      slug: slug,
      parent_gui_id,
      parent_tab_id,
      name,
      widget_type,
      row_id,
      row_column,
      filter_groups,
      description,
      dummy_data_titles,
      associated_fusion_id: fusion.slug,
      created_at: new Date().toISOString(),
      updated_at: null,
      is_active: 1,
      is_deleted: 0,
    },
  };

  try {
    await dynamodb.put(params);

    await createUniversalEvent({
      recordId: slug,
      recordType: "gui_widget_record",
      accountId: accountId,
      eventSlug: "created",
      eventData: params.Item,
      userId: user.slug,
    });

    return {
      statusCode: 201,
      body: { data: params.Item },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(getUser())
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
  .use(
    responseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }: any) => JSON.stringify(body),
        },
      ],
      defaultContentType: "application/json",
    })
  )
  .handler(lambdaHandler); // handles common http errors and returns proper responses
