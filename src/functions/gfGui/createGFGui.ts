import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
import { envTableNames, FOLDERS } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const tableName = envTableNames.DYNAMODB_ACCT_GF_GUIS;
const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
        parent_app_id: {
          type: "string",
          default: 0,
        },
        parent_folder_id: {
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
          default: {},
        },
        individual_access: {
          type: "object",
          default: {},
        },
        parameter_settings: {
          type: "object",
          default: {},
        },
        filter_settings: {
          type: "object",
          default: {},
        },
        org_list_settings: {
          type: "object",
          default: {},
        },
        dataset_list_settings: {
          type: "object",
          default: {},
        },
        contact_list_settings: {
          type: "object",
          default: {},
        },
        fusion_list_settings: {
          type: "object",
          default: {},
        },
        document_list_settings: {
          type: "object",
          default: {},
        },
        dashboard_list_settings: {
          type: "object",
          default: {},
        },
        plugin_settings: {
          type: "object",
          default: {},
        },
        is_active: {
          type: "number",
          default: 1,
        },
      },
      required: ["name"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const fields = event.body;

  const accountId = event.headers["account-id"];
  const folderId = event.queryStringParameters?.folderId;

  try {
    const isDeleted = 0;
    const slug = `${isDeleted}:${fields.parent_app_id}:${v4()}`;
    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: tableName,
      Item: {
        id: `${accountId}`,
        slug: slug,
        ...fields,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_deleted: isDeleted,
      },
    };

    if (folderId) {
      const { Item: folder } = await dynamoDb
        .get({
          TableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
          Key: {
            id: `${accountId}:${FOLDERS}`,
            slug: folderId,
          },
        })
        .promise();

      if (folder) {
        const childs = folder.childs as Record<string, string>[];
        childs.push({
          id: `${accountId}`,
          slug: slug,
        });

        const params: DynamoDB.DocumentClient.UpdateItemInput =
          buildUpdateExpression({
            tableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
            keys: {
              id: `${accountId}:${FOLDERS}`,
              slug: folderId,
            },
            item: {
              childs: childs,
            },
          });

        await dynamoDb.update(params).promise();
      }
    }

    await dynamoDb.put(params).promise();

    return {
      statusCode: 201,
      body: { data: params.Item },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
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
  )
  .handler(lambdaHandler); // handles common http errors and returns proper responses
