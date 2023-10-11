import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { ACCOUNT_SOC_TASKS_TABLE_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_SOC_TASKS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        device_id: {
          type: "string",
        },
        account_type: {
          type: "string",
        },
        event_type_id: {
          type: "string",
        },
        event_status: {
          type: "string",
          default: "ready",
        },
        event_type_instructions: {
          type: "string",
          default: "{}",
        },
        event_type_results: {
          type: "string",
          default: "{}",
        },
        event_start_date: {
          type: "string",
          default: "",
        },
        event_complete_date: {
          type: "string",
          default: "",
        },
        event_schedule_date: {
          type: "string",
        },
      },
      required: [
        "device_id",
        "account_type",
        "event_type_id",
        "event_schedule_date",
      ], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

export const RequsetCreateSocTaskBody = {
  title: "RequsetCreateSocTaskBody",
  RequsetCreateSocTaskBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const {
    device_id,
    account_type,
    event_type_id,
    event_status,
    event_type_instructions,
    event_type_results,
    event_start_date,
    event_complete_date,
    event_schedule_date,
  } = event.body;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: {
      id: `${event_status}:${device_id}:${ACCOUNT_SOC_TASKS_TABLE_NAME}`,
      slug: Math.floor(new Date(event_schedule_date).getTime() / 1000),
      event_status_schedule: `${account_type}:${Math.floor(
        new Date(event_schedule_date).getTime() / 1000
      )}}`, //GSI based on Account : UNIX Scheduled Date Time
      device_id,
      account_type,
      event_type_id,
      event_status,
      event_type_instructions: JSON.parse(event_type_instructions as string),
      event_type_results: JSON.parse(event_type_results as string),
      event_start_date,
      event_complete_date,
      event_schedule_date,
      created_at: new Date().toISOString(),
      updated_at: null,
      is_active: 1,
      is_deleted: 0,
    },
  };

  try {
    await dynamoDb.put(params).promise();
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
