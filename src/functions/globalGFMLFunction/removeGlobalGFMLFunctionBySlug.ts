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
    const { slug: id } = event.pathParameters || {};
    if (!id) {
      throw {
        message: [{ key: "id", value: "Id is required" }],
        code: 421,
      };
    }

    const { Item: app } = await dynamodb
      .get({
        TableName: TABLE_NAME,
        Key: {
          id: `3p:${accountId}:global_gfml_functions`,
          slug: id,
        },
      })
      .promise();

    if (!app) {
      throw createHttpError(404, new Error("Global Function doesn't exists"), {
        expose: true,
      });
    }

    const now = new Date().toISOString();
    const tableParams = {
      TableName: TABLE_NAME,
      UpdateExpression: "SET is_deleted=:is_deleted, updated_at=:updated_at",
      ExpressionAttributeValues: {
        ":is_deleted": true,
        ":updated_at": now,
      },
      Key: {
        id: `3p:${accountId}:global_gfml_functions`,
        slug: id,
      },
    };
    await dynamodb.update(tableParams).promise();

    return {
      statusCode: 200,
      body: {
        message: "Global Function deleted successfully",
      },
    };
  } catch (e) {
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
