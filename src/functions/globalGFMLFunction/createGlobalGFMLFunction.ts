import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import duplicateSlugCheck from "middleware/duplicateSlugCheck";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const TABLE_NAME = envTableNames.DYNAMODB_ACCT_GLOBAL_GFML_FUNCTIONS;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const body = event.body;

    const now = new Date().toISOString();

    const tableParams = {
      TableName: TABLE_NAME,
      Item: {
        id: `3p:${accountId}:global_gfml_functions`,
        slug: `${body.function_slug}:${body.function_group}:${body.function_sub_group}`,
        function_slug: body.function_slug,
        function_script: body.function_script,
        function_group: body.function_group,
        function_sub_group: body.function_sub_group,
        function_title: body.function_title,
        function_button_title: body.function_button_title,
        function_subtitle: body.function_subtitle,
        function_preview: body.function_preview,
        is_active: body.is_active,
        is_deleted: false,
        created_at: now,
        updated_at: null,
      },
    };
    await dynamodb.put(tableParams).promise();

    return {
      statusCode: 200,
      body: {
        data: tableParams.Item,
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(
    duplicateSlugCheck({
      tableName: TABLE_NAME,
      getKey: (accountId, _, event) => ({
        id: `3p:${accountId}:global_gfml_functions`,
        slug: `${event.body.function_slug}:${event.body.function_group}:${event.body.function_sub_group}`,
      }),
    })
  )
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
