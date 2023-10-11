import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
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

const TABLE_NAME = `${envTableNames.DYNAMODB_ACCT_FUSION_FLOW_HISTORY}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const { fusion_slug = "" } = event.pathParameters || {};

    const Items = await dynamodb
      .query({
        TableName: TABLE_NAME,
        FilterExpression: "#is_deleted = :is_deleted",
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:fusion_flows_history`,
          ":is_deleted": false,
          ":slug": `${fusion_slug}:`,
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
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
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
