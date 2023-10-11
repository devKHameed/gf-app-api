import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
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

const TABLE_NAME = envTableNames.DYNAMODB_ACCT_GLOBAL_GFML_FUNCTIONS;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    console.log({ TABLE_NAME });
    const Items = await dynamodb
      .query({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#id = :id",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#id": "id",
          "#is_deleted": "is_deleted",
        },
        ExpressionAttributeValues: {
          ":id": `3p:${accountId}:global_gfml_functions`,
          ":is_deleted": false,
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: {
        data: Items.Items,
        count: Items.Count,
      },
    };
  } catch (e) {
    console.log(e);
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
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
