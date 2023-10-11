import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import {
  ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { AccountUser } from "../../types";
import { GuiDashboardWidget } from "../../types/GuiDashboardWidget";
import buildUpdateExpression from "../../util/buildUpdateExpression";
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
  const formId = event.pathParameters!.formId;
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

  const updates = {
    [`${type}_forms`]: Item[`${type}_forms`]?.map((f) =>
      f.id === formId ? { ...f, ...form_data } : f
    ),
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
      body: { message: "update successfully" },
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
  .handler(lambdaHandler);
