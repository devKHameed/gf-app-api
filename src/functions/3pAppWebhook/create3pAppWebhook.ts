import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import getGuiFusionHttpApiUrl from "../../util/ssm/getGuiFusionHttpApiUrl";

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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_WEBHOOKS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const GUI_FUSION_API_URL = await getGuiFusionHttpApiUrl();
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

    if (body.incoming_communication === "") {
      body.incoming_communication = { output: "{{body}}" };
    }

    let uuid = "";
    let shared_url_address = "";
    if (body.webhook_type === "shared") {
      uuid = v4().replace(/-/g, "");
      shared_url_address = `${GUI_FUSION_API_URL}/fusion/webhook/shared/${accountId}?id=${uuid}`;
    }

    const tableParams = {
      TableName: tableName,
      Item: {
        id: `3p:${accountId}:3p_app_webhooks`,
        slug: `${id}:${v4()}`,
        // partner_id: partner.id,
        label: body.label,
        incoming_communication: body.incoming_communication,
        connection_id: body.connection_id,
        alt_connection_id: body.alt_connection_id,
        webhook_type: body.webhook_type,
        shared_url_address: shared_url_address,
        shared_url_uuid: uuid,
        app_parameters: body.app_parameters,
        app_detach: body.app_detach,
        app_attach: body.app_attach,
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
