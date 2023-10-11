import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import {
  ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const TABLE_NAME = envTableNames.DYNAMODB_GF_DASHBOARD_WIDGETS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const parentGuiId = event.queryStringParameters?.parent_gui_id;
  const parentTabId = event.queryStringParameters?.parent_tab_id;
  const accountId: string = event.headers["account-id"] as string;
  const id = `${accountId}:${ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME}`;
  const slugPrefix = `0:${parentGuiId}:${parentTabId}`;

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": id,
      ":slug": slugPrefix,
    },
  };

  try {
    const { Items } = await dynamodb.query(params);
    return {
      statusCode: 200,
      body: { message: "List of widgets", data: Items },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
  );
