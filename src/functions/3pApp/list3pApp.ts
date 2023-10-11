import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { ThreePApp } from "../../types";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = `${envTableNames.DYNAMODB_ACCT_3P_APPS}`;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const includeGlobal = event.queryStringParameters?.["include"] === "global";

    const apps = await dynamoDb
      .query({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#id = :id",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
        },
        ExpressionAttributeValues: {
          ":id": `3p:${accountId}:3p_apps`,
          ":is_deleted": 0,
        },
      })
      .promise()
      .then((res) => (res.Items as ThreePApp[]) || []);

    if (includeGlobal) {
      await dynamoDb
        .query({
          TableName: TABLE_NAME,
          KeyConditionExpression: "#id = :id",
          FilterExpression: "#is_deleted = :is_deleted",
          ExpressionAttributeNames: {
            "#is_deleted": "is_deleted",
            "#id": "id",
          },
          ExpressionAttributeValues: {
            ":id": "3p:global:3p_apps",
            ":is_deleted": 0,
          },
        })
        .promise()
        .then((res) => apps.unshift(...((res.Items as ThreePApp[]) || [])));
    }

    return {
      statusCode: 200,
      body: { message: "List of 3p apps", data: apps },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  // .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
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
