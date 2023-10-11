import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createError from "http-errors";
import { ACCOUNT_UPLOAD_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const tableName = envTableNames.DYNAMODB_ACCT_UPLOAD_DESIGN;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const accountId: string = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: tableName,
    IndexName: "is_deleted_lsi",
    KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
    ExpressionAttributeNames: {
      "#id": "id",
      "#is_deleted": "is_deleted",
    },
    ExpressionAttributeValues: {
      ":id": `${accountId}:${ACCOUNT_UPLOAD_DESIGN_TABLE_NAME}`,
      ":is_deleted": 0,
    },
  };

  try {
    const { Items } = await dynamodb.query(params);

    return {
      statusCode: 200,
      body: { message: "List of upload design", data: Items },
    };
  } catch (error: unknown) {
    const err = error as Error;
    throw createError(500, err, { expose: true });
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
