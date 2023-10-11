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
import * as uuid from "uuid";
import { ACCOUNT_PRESNTATIONS_TABLE_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_PRESENTATIONS;
const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        title: {
          type: "string",
        },
        sort_order: {
          type: "number",
          default: 0,
        },
      },
      required: ["title"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;
export const RequsetCreatePresentationBody = {
  title: "RequsetCreatePresentationBody",
  RequsetCreatePresentationBody: eventSchema.properties.body,
};
export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const { title, sort_order } = event.body;
    const accountId: string = event.headers["account-id"] as string;

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: TABLE_NAME,
      Item: {
        id: `${accountId}:${ACCOUNT_PRESNTATIONS_TABLE_NAME}`,
        slug: uuid.v4(),
        title,
        sort_order,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_active: 1,
        is_deleted: 0,
      },
    };

    // write a organization to the database
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
