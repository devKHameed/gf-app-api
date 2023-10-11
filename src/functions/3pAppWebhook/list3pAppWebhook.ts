import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_WEBHOOKS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const { id } = event.pathParameters || {};
    const isGlobal = event.queryStringParameters?.["is_global"] === "true";
    if (!id) {
      throw {
        message: [{ key: "slug", value: "App Slug is required" }],
        code: 421,
      };
    }

    const Items = await dynamodb
      .query({
        TableName: tableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
        },
        ExpressionAttributeValues: {
          ":id": `3p:${isGlobal ? "global" : accountId}:3p_app_webhooks`,
          ":is_deleted": false,
          ":slug": `${id}:`,
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: { data: Items.Items, count: Items.Count },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

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
