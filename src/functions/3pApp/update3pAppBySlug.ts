import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import getAccountData from "../../middleware/getAccountData";
import has3pAppAccess from "../../middleware/has3pAppAccess";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = `${envTableNames.DYNAMODB_ACCT_3P_APPS}`;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        app_status: {
          type: "string",
        },
        app_label: {
          type: "string",
        },
        app_description: {
          type: "string",
        },
        app_color: {
          type: "string",
        },
        app_logo: {
          type: "string",
        },
        app_color_logo: {
          type: "string",
        },
        app_tags: {
          type: "array",
        },
        app_language: {
          type: "string",
        },
        app_audience: {
          type: "string",
        },
        base_structure: {
          type: "object",
        },
        common_data: {
          type: "object",
        },
        invite_only: {
          type: "boolean",
        },
        app_version: {
          type: "string",
        },
        groups: {
          type: "array",
        },
        read_me: {
          type: "string",
        },
        app_logo_image: {
          type: "object",
        },
        is_active: {
          type: "boolean",
        },
      },
      required: [], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const slug = event.pathParameters!.slug;
    const fields = event.body;

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        keys: {
          id: `3p:${accountId}:3p_apps`,
          slug: slug!,
        },
        tableName: TABLE_NAME,
        item: fields,
      });

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

export const handler = middy()
  .use(getAccountData())
  .use(has3pAppAccess())
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(
    httpResponseSerializer({
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
