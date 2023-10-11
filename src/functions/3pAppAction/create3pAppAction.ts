import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_ACTIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const body = event.body;
    const { id } = event.pathParameters || {};
    if (!id) {
      throw {
        message: [{ key: "slug", value: "App Slug is required" }],
        code: 421,
      };
    }

    const now = new Date().toISOString();

    const tableParams = {
      TableName: tableName,
      Item: {
        id: `3p:${accountId}:3p_app_actions`,
        slug: `${id}:${v4()}`,
        module_name: body.module_name,
        label: body.label,
        connection_id: body.connection_id,
        alt_connection_id: body.alt_connection_id,
        module_type: body.module_type,
        module_action: body.module_action,
        description: body.description,
        search: body.search,
        communication: body.communication,
        static_parameters: body.static_parameters,
        mappable_parameters: body.mappable_parameters,
        interface: body.interface,
        samples: body.samples,
        required_scope: body.required_scope,
        availability: body.availability,
        allow_for_invite: body.allow_for_invite,
        shared_url_address: body.shared_url_address,
        app_detach: body.app_detach,
        app_attach: body.app_attach,
        epoch: body.epoch,
        universal_subtype: body.universal_subtype,
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
