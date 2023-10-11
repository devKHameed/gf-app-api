import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import kebabCase from "lodash/kebabCase";
import { v4 } from "uuid";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { AccountUser } from "../../types";

const tableName = envTableNames.DYNAMODB_ACCT_UNIVERSAL_NOTES;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        title: {
          type: "string",
        },
        value: {
          type: "string",
        },
        note_type: {
          type: "string",
        },
        tags: {
          type: "array",
          items: { type: "object" },
          default: [],
        },
      },
      required: ["title", "value", "note_type"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { title, value, note_type, tags } = event.body;

  const accountId = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: tableName,
    Item: {
      id: `${accountId}:${kebabCase(note_type)}`,
      slug: `${v4()}`,
      title,
      value,
      tags,
      created_by: (event.user as AccountUser)?.slug,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: 0,
    },
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

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(getUser())
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
  )
  .handler(lambdaHandler); // handles common http errors and returns proper responses
