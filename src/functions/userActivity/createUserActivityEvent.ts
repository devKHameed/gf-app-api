import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const tableName = envTableNames.DYNAMODB_ACCT_EVENT_STORAGE;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        event_type: { type: "string" },
        event_metadata: {
          type: "object",
          default: {},
        },
      },
      required: ["user_id", "event_type"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

export const buildUserActivityItem = (
  userId: string,
  eventType: string,
  eventMetadata?: Record<string, unknown>
) => {
  const datetime = Date.now();
  return {
    id: userId,
    slug: `${datetime}:${eventType}`,
    event_type_datetime: `${eventType}:${datetime}`,
    datetime,
    event_type: eventType,
    event_metadata: eventMetadata,
    created_at: new Date().toISOString(),
  };
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { user_id, event_type, event_metadata } = event.body;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: tableName,
    Item: buildUserActivityItem(user_id, event_type, event_metadata),
  };

  try {
    await dynamodb.put(params);
    return {
      statusCode: 201,
      body: { data: params.Item },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
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
  ); // handles common http errors and returns proper responses
