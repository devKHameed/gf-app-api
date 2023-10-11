import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_CONFIGS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const body = event.body;

    const { appId, three_p_app_id, id = "" } = event.pathParameters || {};

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

    const { Item } = await dynamodb
      .get({
        TableName: tableName,
        Key: {
          id: `3p_app_config:${appId}:${three_p_app_id}`,
          slug: id,
        },
      })
      .promise();

    if (!Item) {
      throw {
        message: [{ key: "app", value: "3P App Config doesn't exists" }],
        code: 404,
      };
    }

    const tableParams: DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: tableName,
      UpdateExpression: "",
      ExpressionAttributeValues: {},
      Key: {
        id: `3p_app_config:${appId}:${three_p_app_id}`,
        slug: id,
      },
    };

    const now = new Date().toISOString();

    let prefix = "set ";
    const attributes = Object.keys(body);
    for (let i = 0; i < attributes.length; i++) {
      const attribute = attributes[i];
      tableParams["UpdateExpression"] +=
        prefix + "" + attribute + " = :" + attribute;
      tableParams["ExpressionAttributeValues"]![":" + attribute] =
        body[attribute];
      prefix = ", ";
    }

    tableParams["UpdateExpression"] += prefix + "updated_at" + " = :updated_at";
    tableParams["ExpressionAttributeValues"]![":updated_at"] = now;

    await dynamodb.update(tableParams).promise();

    return {
      statusCode: 200,
      body: { message: "Table updated successfully" },
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
