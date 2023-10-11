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
import { v4 as uuid } from "uuid";
import { envTableNames, FOLDERS } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_FOLDERS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        resource: {
          type: "string",
        },
        name: {
          type: "string",
        },
        sort_order: {
          type: "number",
          default: 0,
        },
        childs: {
          type: "array",
          default: [],
        },
        parent_folder_id: {
          type: "string",
        },
      },
      required: ["resource", "name"],
    },
  },
  required: ["body"],
} as const;

export const RequsetCreateFolderBody = {
  title: "RequsetCreateFolderBody",
  RequsetCreateFolderBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { resource, name, sort_order, childs, parent_folder_id } = event.body;
  const account_id: string = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: {
      id: `${account_id}:${FOLDERS}`,
      slug: `false:${resource}:${uuid()}`,
      name,
      resource,
      sort_order,
      childs,
      parent_folder_id,
      created_at: new Date().toISOString(),
      updated_at: null,
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
  ); // handles common http errors and returns proper responses
