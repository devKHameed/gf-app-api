import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { ACCOUNTS_TABLE_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async () => {
  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: TABLE_NAME,
    IndexName: "is_deleted_lsi_index",
    KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
    ExpressionAttributeNames: {
      "#id": "id",
      "#is_deleted": "is_deleted",
    },
    ExpressionAttributeValues: {
      ":id": ACCOUNTS_TABLE_NAME,
      ":is_deleted": 0,
    },
  };

  try {
    // fetch data from the database
    const { Items } = await dynamoDb.query(params).promise();
    return {
      statusCode: 200,
      body: { message: "List of accounts", data: Items },
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
