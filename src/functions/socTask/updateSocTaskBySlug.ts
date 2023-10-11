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
import buildUpdateExpression from "../../util/buildUpdateExpression";

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
        },
        event_type_instructions: {
          type: "string",
        },
        event_type_results: {
          type: "string",
        },
        event_start_date: {
          type: "string",
        },
        event_complete_date: {
          type: "string",
        },
        event_schedule_date: {
          type: "string",
        },
      },
      required: [], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

export const RequsetUpdateSocTaskBody = {
  title: "RequsetUpdateSocTaskBody",
  RequsetUpdateSocTaskBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const fields = event.body;
  const deviceId = event.queryStringParameters?.["deviceId"] || "";

  if (fields.event_type_instructions) {
    fields.event_type_instructions = JSON.parse(fields.event_type_instructions);
  }

  if (fields.event_type_results) {
    fields.event_type_results = JSON.parse(fields.event_type_results);
  }

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: `ready:${deviceId}:${ACCOUNT_SOC_TASKS_TABLE_NAME}`,
        slug: slug!,
      },
      tableName: TABLE_NAME,
      item: fields,
    }
  );

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
