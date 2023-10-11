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

const tableName = envTableNames.DYNAMODB_ACCT_FUSION_SETS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
        parent_app_id: {
          type: "string",
          default: 0,
        },
        parent_folder_id: {
          type: "string",
        },
        sort_order: {
          type: "number",
        },
        color: {
          type: "string",
        },
        icon: {
          type: "string",
        },
        description: {
          type: "string",
        },
        current_version: {
          type: "string",
        },
        role_based_access: {
          type: "object",
          default: {},
        },
        individual_access: {
          type: "object",
          default: {},
        },
        related_fields: {
          type: "object",
          default: {},
        },
        child_fusion_flows: {
          type: "object",
          default: {},
        },
        related_datasets: {
          type: "object",
          default: {},
        },
        is_active: {
          type: "number",
          default: 1,
        },
      },
      required: ["name"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const fields = event.body;

  const accountId = event.headers["account-id"];

  const isDeleted = 0;
  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: tableName,
    Item: {
      id: `${accountId}`,
      slug: `${isDeleted}:${fields.parent_app_id}:${v4()}`,
      ...fields,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: isDeleted,
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
