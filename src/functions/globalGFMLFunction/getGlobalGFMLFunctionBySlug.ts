import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import _ from "lodash";
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
    const { id } = event.pathParameters || {};
    if (!id) {
      throw {
        message: [{ key: "id", value: "Id is required" }],
        code: 421,
      };
    }

    // Check Owner
    const { Item: app } = await dynamodb
      .get({
        TableName: TABLE_NAME,
        Key: {
          id: `3p:${accountId}:global_gfml_functions`,
          slug: id,
        },
      })
      .promise();

    if (!_.size(app)) {
      throw {
        message: [{ key: "app", value: "Global Function doesn't exists" }],
        code: 404,
      };
    }

    return {
      statusCode: 200,
      body: {
        data: app,
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
