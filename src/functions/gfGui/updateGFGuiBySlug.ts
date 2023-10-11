import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const tableName = envTableNames.DYNAMODB_ACCT_GF_GUIS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
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
        gui_type: {
          type: "string",
        },
        role_based_access: {
          type: "object",
        },
        individual_access: {
          type: "object",
        },
        parameter_settings: {
          type: "object",
        },
        filter_settings: {
          type: "object",
        },
        org_list_settings: {
          type: "object",
        },
        dataset_list_settings: {
          type: "object",
        },
        contact_list_settings: {
          type: "object",
        },
        fusion_list_settings: {
          type: "object",
        },
        document_list_settings: {
          type: "object",
        },
        dashboard_list_settings: {
          type: "object",
        },
        plugin_settings: {
          type: "object",
        },
        is_active: {
          type: "number",
          default: 1,
        },
      },
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters?.slug;
  const fields = event.body;
  const accountId = event.headers["account-id"];

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: `${accountId}`,
        slug: slug!,
      },
      tableName: tableName,
      item: { ...fields, updated_at: new Date().toISOString() },
    }
  );

  try {
    await dynamodb.update(params);

    return {
      statusCode: 200,
      body: { message: "update successful" },
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
