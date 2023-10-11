import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import * as uuid from "uuid";
import { ACCOUNT_GF_APPS, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_GF_APPS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
        color: {
          type: "string",
          default: "",
        },
        icon: {
          type: "string",
          default: "",
        },
        language: {
          type: "string",
          default: "",
        },
        audience: {
          type: "string",
          default: "",
        },
        description: {
          type: "string",
          default: "",
        },
        current_version: {
          type: "string",
          default: "",
        },
        child_gui: {
          type: "object",
          default: {},
        },
        child_fusions: {
          type: "object",
          default: {},
        },
        required_plugins: {
          type: "object",
          default: {},
        },
        associated_documents: {
          type: "object",
          default: {},
        },
        parent_app_id: {
          type: "number",
          default: 0,
        },
        parent_folder_id: {
          type: "string",
          default: "0",
        },
        sort_order: {
          type: "number",
          default: Date.now(),
        },
      },
      required: ["name"],
    },
  },
  required: ["body"],
} as const;
export const RequsetCreateGFAppBody = {
  title: "RequsetCreateGFAppBody",
  RequsetCreateGFAppBody: eventSchema.properties.body,
};
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const {
    name,
    color,
    icon,
    language,
    audience,
    description,
    current_version,
    child_gui,
    child_fusions,
    required_plugins,
    associated_documents,
    parent_app_id,
    parent_folder_id,
    sort_order,
  } = event.body;
  const account_id: string = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: {
      id: `${account_id}:${ACCOUNT_GF_APPS}`,
      slug: `false:${uuid.v4()}`,
      name, //string
      color, //string
      icon, //string
      language, //string
      audience, //string
      description, //string
      current_version, //string
      child_gui, //JSON
      child_fusions, //JSON
      required_plugins, //JSON
      associated_documents, //JSON
      parent_app_id,
      parent_folder_id,
      sort_order,
      created_at: new Date().toISOString(),
      updated_at: null,
      is_active: 1,
      is_deleted: 0,
    },
  };

  try {
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
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
