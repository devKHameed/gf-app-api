import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import createError from "http-errors";
import duplicateSlugCheck from "../../middleware/duplicateSlugCheck";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

import { AWSError } from "aws-sdk";
import DynamoDB from "aws-sdk/clients/dynamodb";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { ACCOUNT_USER_TYPES_TABLE_NAME, envTableNames } from "../../config";
const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_USER_TYPES;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          pattern: "^[a-zA-Z0-9-]*$",
        },
        name: {
          type: "string",
        },
        contact_type_id: {
          type: "string",
        },
        fields: {
          type: "object",
          default: {},
        },
        permissions: {
          type: "object",
          default: {},
        },
      },
      required: ["slug", "name", "contact_type_id"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;
export const RequsetCreateUserTypeBody = {
  title: "RequsetCreateUserTypeBody",
  RequsetCreateUserTypeBody: eventSchema.properties.body,
};
export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const { slug, name, fields, permissions } = event.body;
    const account_id: string = event.headers["account-id"] as string;

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: TABLE_NAME,
      Item: {
        id: `${account_id}:${ACCOUNT_USER_TYPES_TABLE_NAME}`,
        slug,
        name,
        fields,
        permissions,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_active: 1,
        is_deleted: 0,
      },
    };

    // write a contact to the database
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

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(
    duplicateSlugCheck({
      tableName: TABLE_NAME,
      accountPostfix: "acct_project_types",
    })
  )
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
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
