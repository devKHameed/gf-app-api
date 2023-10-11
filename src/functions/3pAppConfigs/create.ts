import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
import { envTableNames, STAGE } from "../../config";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_CONFIGS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const body = event.body;
    const { appId } = event.pathParameters || {};

    // Check Owner
    const { Item: app } = await dynamodb
      .get({
        TableName: tableName,
        Key: {
          id: appId,
          // partnerId: partner.id,
        },
      })
      .promise();

    if (!app) {
      throw {
        message: [{ key: "app", value: "App doesn't exists" }],
        code: 404,
      };
    }

    const three_p_app_config = await dynamodb
      .query({
        TableName: `${STAGE}-a-${app.slug}`,
        KeyConditionExpression: "#id = :id",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
        },
        ExpressionAttributeValues: {
          ":id": `3p_app_config:${appId}:${body.three_p_app_id}`,
          ":is_deleted": false,
        },
      })
      .promise();

    if (!three_p_app_config.Items) {
      throw {
        message: [{ key: "app", value: "three_p_app_config doesn't exists" }],
        code: 404,
      };
    }

    const now = new Date().toISOString();

    if (three_p_app_config.Count && three_p_app_config.Count > 0) {
      const item = three_p_app_config.Items[0];

      await dynamodb
        .delete({
          TableName: `${STAGE}-a-${app.slug}`,
          Key: {
            id: `3p_app_config:${appId}:${body.three_p_app_id}`,
            slug: item.slug,
          },
        })
        .promise();
    }

    const tableParams = {
      TableName: `${STAGE}-a-${app.slug}`,
      Item: {
        id: `3p_app_config:${appId}:${body.three_p_app_id}`,
        slug: `${body.is_deleted}:${v4()}`,
        // partner_id: partner.id,
        app_id: appId,
        three_p_app_id: body.three_p_app_id,
        configurations: body.configurations,
        is_active: body.is_active,
        is_deleted: false,
        created_at: now,
        updated_at: now,
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
