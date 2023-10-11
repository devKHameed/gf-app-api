import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import {
  default as createError,
  default as createHttpError,
} from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const tableName = `${envTableNames.DYNAMODB_ACCT_FUSION_CONNECTION}`;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const fields = event.body;
    const { id = "" } = event.pathParameters || {};
    if (!id) {
      throw {
        message: [{ key: "id", value: "id is required" }],
        code: 421,
      };
    }

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        keys: {
          id: `${accountId}:fusion_connections`,
          slug: id,
        },
        tableName: tableName,
        item: fields,
      });

    try {
      await dynamoDb.update(params).promise();

      //TODO: If user need send back the data
      return {
        statusCode: 200,
        body: { message: "update successfully" },
      };
    } catch (error: unknown) {
      const err: AWSError = error as AWSError;
      throw createError(err.statusCode!, err, { expose: true });
    }
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
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
  );
