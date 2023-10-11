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

const tableName = `${envTableNames.DYNAMODB_ACCT_FUSIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const { id = "" } = event.pathParameters || {};

    if (!id) {
      throw {
        message: [{ key: "id", value: "id is required" }],
        code: 421,
      };
    }

    const { Item } = await dynamodb
      .get({
        TableName: tableName,
        Key: {
          id: `${accountId}:fusions`,
          slug: id,
        },
      })
      .promise();
    if (!Item) {
      throw {
        message: `Fusion doesn't exists against this id=${id}`,
        code: 404,
      };
    }

    return {
      statusCode: 200,
      body: {
        data: Item,
      },
    };
  } catch (e) {
    console.log(e);
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  // .use(validator({ eventSchema })) // validates the input
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
