import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { SKILL_INTENTS_TABLE_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  // const account_id: string = event.headers["account-id"] as string;
  const skill_slug = event.queryStringParameters?.skill_slug;

  // fetch all admins from the database
  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: envTableNames.DYNAMODB_SKILL_INTENTS,
    KeyConditionExpression: "#id = :id AND begins_with(#slug,:slug)",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
      // "#is_delete": "is_delete",
    },
    // FilterExpression: "#is_delete = :is_delete",
    ExpressionAttributeValues: {
      ":id": SKILL_INTENTS_TABLE_NAME,
      ":slug": `${skill_slug}:`,
      // ":is_delete": 0,
    },
  };

  try {
    // fetch data from the database
    const { Items } = await dynamoDb.query(params).promise();
    return {
      statusCode: 200,
      body: { message: "List of Intents", data: Items },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
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
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
