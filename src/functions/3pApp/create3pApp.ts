import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
import { envTableNames, FOLDERS } from "../../config";
import getAccountData from "../../middleware/getAccountData";
import has3pAppAccess from "../../middleware/has3pAppAccess";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        app_name: {
          type: "string",
          default: "",
          pattern: "^[a-zA-Z0-9-]*$",
        },
        app_status: {
          type: "string",
          default: "",
        },
        app_label: {
          type: "string",
          default: "",
        },
        app_description: {
          type: "string",
          default: "",
        },
        app_color: {
          type: "string",
          default: "",
        },
        app_logo: {
          type: "string",
          default: "",
        },
        app_color_logo: {
          type: "string",
          default: "",
        },
        app_tags: {
          type: "array",
          default: [],
        },
        app_language: {
          type: "string",
          default: "",
        },
        app_audience: {
          type: "string",
          default: "",
        },
        base_structure: {
          type: "object",
          default: {},
        },
        common_data: {
          type: "object",
          default: {},
        },
        invite_only: {
          type: "boolean",
          default: false,
        },
        app_version: {
          type: "string",
          default: "",
        },
        groups: {
          type: "array",
          default: [],
        },
        read_me: {
          type: "string",
          default: "",
        },
        three_p_version: {
          type: "number",
          default: 1.0,
        },
        app_logo_image: {
          type: "object",
          default: {},
        },
        is_active: {
          type: "number",
          default: 1,
        },
      },
      required: ["app_name"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const TABLE_NAME = `${envTableNames.DYNAMODB_ACCT_3P_APPS}`;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const {
      app_status,
      app_name,
      app_label,
      app_description,
      app_color,
      app_logo,
      app_color_logo,
      app_tags,
      app_language,
      app_audience,
      base_structure,
      common_data,
      invite_only,
      app_version,
      groups,
      read_me,
      three_p_version,
      app_logo_image,
      is_active,
    } = event.body;

    const slug = `current:${app_name}:${v4()}`;

    const tableParams = {
      TableName: TABLE_NAME,
      Item: {
        id: `3p:${accountId}:3p_apps`,
        slug: slug,
        app_status,
        app_name,
        app_label,
        app_description,
        app_color,
        app_logo,
        app_color_logo,
        app_tags,
        app_language,
        app_audience,
        base_structure,
        common_data,
        invite_only,
        app_version,
        groups,
        read_me,
        three_p_version,
        app_logo_image,
        is_active,
        is_deleted: 0,
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    };
    await dynamodb.put(tableParams).promise();

    const readParams: DynamoDB.DocumentClient.QueryInput = {
      TableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
      KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
      FilterExpression: "#name = :name",
      ExpressionAttributeNames: {
        "#id": "id",
        "#slug": "slug",
        "#name": "name",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${FOLDERS}`,
        ":slug": "false:3p-app",
        ":name": "3P Apps",
      },
    };

    const { Items: folders = [] } = await dynamodb.query(readParams).promise();

    if (folders.length) {
      const childs: Array<object> = folders[0].childs;

      childs.push({
        id: `3p:${accountId}:3p_apps`,
        slug: slug,
      });

      const params: DynamoDB.DocumentClient.UpdateItemInput =
        buildUpdateExpression({
          tableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
          keys: {
            id: `${accountId}:${FOLDERS}`,
            slug: folders[0].slug!,
          },
          item: {
            childs: childs,
          },
        });

      await dynamodb.update(params).promise();
    } else {
      const folderParams: DynamoDB.DocumentClient.PutItemInput = {
        TableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
        Item: {
          id: `${accountId}:${FOLDERS}`,
          slug: `false:3p-app:${v4()}`,
          name: "3P Apps",
          sort_order: 0,
          childs: [
            {
              id: `3p:${accountId}:3p_apps`,
              slug: slug,
            },
          ],
          created_at: new Date().toISOString(),
          updated_at: null,
          is_deleted: 0,
        },
      };

      await dynamodb.put(folderParams).promise();
    }

    return {
      statusCode: 200,
      body: { data: tableParams.Item },
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
