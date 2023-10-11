import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import duplicateSlugCheck from "middleware/duplicateSlugCheck";
import { envTableNames } from "../../config";
import getAccountData from "../../middleware/getAccountData";
import has3pAppAccess from "../../middleware/has3pAppAccess";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_GFML_FUNCTIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const body = event.body;
    const { id } = event.pathParameters || {};
    if (!id) {
      throw {
        message: [{ key: "id", value: "Id is required" }],
        code: 421,
      };
    }

    const now = new Date().toISOString();

    const tableParams = {
      TableName: tableName,
      Item: {
        id: `3p:${accountId}:3p_gfml_functions`,
        slug: `${id}:${body.function_slug}`,
        // partner_id: partner.id,
        function_slug: body.function_slug,
        function_value: body.function_value,
        label: body.label,
        is_active: body.is_active,
        is_deleted: false,
        created_at: now,
        updated_at: null,
      },
    };
    await dynamodb.put(tableParams).promise();

    return {
      statusCode: 200,
      body: { data: tableParams.Item },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(getAccountData())
  .use(has3pAppAccess())
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(httpErrorHandler())
  .use(
    duplicateSlugCheck({
      tableName,
      getKey: (accountId, _, event) => ({
        id: `${accountId}:3p_gfml_functions`,
        slug: `${event.pathParameters.id}:${event.body.function_slug}`,
      }),
    })
  )
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
