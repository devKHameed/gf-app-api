import middy from "@middy/core";
import * as uuid from "uuid";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountUser } from "types";
import { ACCOUNT_USAGE_TOKENS_TABLE_NAME, envTableNames } from "../../config";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_PORTAL_OFFERS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        is_public: {
          type: "boolean",
          default: false,
        },
        name: {
          type: "string",
        },
        description: {
          type: "string",
          default: "",
        },
      },
      required: ["name"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

export const RequsetCreateUsageTokenBody = {
  title: "RequsetCreateUsageTokenBody",
  RequsetCreateUsageTokenBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { is_public, name, description } = event.body;

  const accountId: string = event.headers["account-id"] as string;

  try {
    const slug = `false:${is_public}:${uuid.v4()}`;
    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: TABLE_NAME,
      Item: {
        id: `${accountId}:${ACCOUNT_USAGE_TOKENS_TABLE_NAME}`,
        slug: slug,
        is_public,
        name,
        description,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_active: 1,
        is_deleted: 0,
      },
    };

    await createUniversalEvent({
      recordId: slug,
      recordType: "usage_token_record",
      accountId: accountId,
      eventSlug: "created",
      eventData: {},
      userId: (event.user as AccountUser).slug,
    });

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
  .use(getUser())
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
