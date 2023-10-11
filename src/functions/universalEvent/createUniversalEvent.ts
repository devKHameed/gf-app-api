import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import {
  CreateUniversalEvent,
  UniversalEvent,
} from "../../types/UniversalEvent";

const tableName = envTableNames.DYNAMODB_ACCT_UNIVERSAL_EVENTS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        record_type: {
          type: "string",
        },
        record_id: {
          type: "string",
        },
        event_slug: {
          type: "string",
        },
        event_data: {
          type: "object",
        },
      },
      required: ["record_type", "record_id", "event_slug", "event_data"],
    },
  },
  required: ["body"],
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { record_id, record_type, event_slug, event_data } = event.body;
  const account_id: string = event.headers["account-id"] as string;

  const universalEvent = await createUniversalEvent({
    recordId: record_id,
    recordType: record_type,
    eventSlug: event_slug,
    eventData: event_data,
    userId: "",
    accountId: account_id,
  });

  try {
    return {
      statusCode: 201,
      body: { data: universalEvent },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const createUniversalEvent = async (data: CreateUniversalEvent) => {
  const { accountId, recordId, recordType, eventSlug, eventData, userId } =
    data;
  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: tableName,
    Item: {
      id: `${accountId}:${recordType}`,
      slug: `${recordId}:${eventSlug}:${v4()}`,
      event_slug_record_type_idx: `${eventSlug}:${recordType}`,
      record_id: recordId,
      record_type: recordType,
      event_slug: eventSlug,
      event_data: eventData,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: null,
    },
  };

  await dynamodb.put(params);

  return params.Item as UniversalEvent;
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
