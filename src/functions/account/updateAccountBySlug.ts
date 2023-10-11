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
import { ACCOUNTS_TABLE_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
        startup_fee: {
          type: "number",
        },
        monthly_fee: {
          type: "number",
        },
        app_user_settings: {
          type: "object",
        },
        user_limit_settings: {
          type: "object",
        },
        operation_settings: {
          type: "object",
        },
        contact_settings: {
          type: "object",
        },
        project_settings: {
          type: "object",
        },
        dynamo_storage_settings: {
          type: "object",
        },
        sql_storage_settings: {
          type: "object",
        },
        chat_settings: {
          type: "object",
        },
        stripe_card: {
          type: "object",
        },
        stripe_customer: {
          type: "object",
        },
        stripe_charges: {
          type: "object",
        },
        website_url: {
          type: "string",
        },
        phone: {
          type: "string",
        },
        mailing_address_1: {
          type: "string",
        },
        mailing_address_2: {
          type: "string",
        },
        city: {
          type: "string",
        },
        state: {
          type: "string",
        },
        zip: {
          type: "string",
        },
      },
      required: [], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

export const RequsetUpdateAccountBody = {
  title: "RequsetUpdateAccountBody",
  RequsetUpdateAccountBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const fields = event.body;

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: ACCOUNTS_TABLE_NAME,
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
