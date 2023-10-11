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
import {
  GuiDashboardWidget,
  WidgetAction,
} from "../../types/GuiDashboardWidget";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import { createFusion } from "../../util/fusion";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const TABLE_NAME = envTableNames.DYNAMODB_GF_DASHBOARD_WIDGETS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["create", "edit"],
        },
        form_data: {
          type: "object",
        },
      },
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const { type, form_data } = event.body;
  const accountId = event.headers["account-id"] as string;

  const user = event.user as AccountUser;

  if (!user) {
    throw createError(401, "Unauthorized");
  }

  if (!type || !form_data) {
    throw createError(400, "Bad Request");
  }

  const getParams: DynamoDB.DocumentClient.GetItemInput = {
    TableName: TABLE_NAME,
    Key: {
      id: `${accountId}:${ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME}`,
      slug: slug,
    },
  };

  const getRes = await dynamodb.get(getParams);

  const Item = getRes.Item as GuiDashboardWidget;

  if (!Item) {
    throw createError(404, "Not found");
  }

  const populateFusion = await createWidgetFusion(
    type,
    Item,
    "populate",
    accountId,
    form_data as WidgetAction
  );
  const submitFusion = await createWidgetFusion(
    type,
    Item,
    "submit",
    accountId,
    form_data as WidgetAction
  );

  const newForm = {
    ...form_data,
    populate_fusion: populateFusion.fusion_slug,
    submit_fusion: submitFusion.fusion_slug,
  };

  const updates = {
    [`${type}_forms`]: [...(Item[`${type}_forms`] || []), newForm],
  };

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: `${accountId}:${ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME}`,
        slug: slug!,
      },
      tableName: TABLE_NAME,
      item: updates,
    }
  );

  try {
    await dynamodb.update(params);

    await createUniversalEvent({
      recordId: slug!,
      recordType: "gui_widget_record",
      accountId: accountId,
      eventSlug: "edit",
      eventData: updates,
      userId: user.slug,
    });

    return {
      statusCode: 200,
      body: { message: "update successfully", data: newForm },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

const createWidgetFusion = async (
  type: string,
  Item: GuiDashboardWidget,
  fusionType: string,
  accountId: string,
  formData: WidgetAction
) => {
  const isDeleted = 0;
  const fusionSlug = `${isDeleted}:${
    Item.slug
  }:data-list-widget-${type}-action-form-${fusionType}:${v4()}`;

  const startOperator: FusionOperator = {
    app: "system",
    operator_subtitle: "System Module",
    is_start_node: true,
    parent_fusion_id: fusionSlug,
    total_credit: 1,
    operator_title: "Start Widget Module",
    app_module: "widget-start-operator",
    operator_slug: `widget-start-operator_${v4()}`,
    app_id: "system",
  };
  const endOperator: FusionOperator = {
    app: "system",
    app_id: "system",
    app_module: `data-list-widget-${type}-action-form-node`,
    operator_slug: v4(),
    operator_subtitle: "System Module",
    is_start_node: false,
    parent_fusion_id: fusionSlug,
    parent_operator_slug: startOperator.operator_slug,
    total_credit: 1,
    operator_title: `Widget ${type} Action ${fusionType}`,
  };

  const startNodeId = v4();
  const chartNodeId = v4();
  const fusion = await createFusion(accountId, {
    fusion_slug: fusionSlug,
    slug: fusionSlug,
    fusion_title: `${Item.name} - ${formData.button_title}`,
    fusion_type: `data-list-widget-${type}-action-form-${fusionType}`,
    fusion_operators: [startOperator, endOperator],
    widget_action_form_data: {
      widget_slug: Item.slug,
      form_id: formData.id,
    },
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
          data: endOperator,
        },
      ],
      edges: [
        {
          id: `e${startNodeId}-${chartNodeId}`,
          data: {},
          source: startNodeId,
          target: chartNodeId,
          type: "flow-edge",
        },
      ],
    },
  });

  console.log("🚀 ~ file: createDashboardWidgetForm.ts:217 ~ fusion:", fusion);

  return fusion;
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
  .handler(lambdaHandler);
