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
import {
  ACCOUNT_DOCUMENT_DESIGN_TABLE_NAME,
  envTableNames,
} from "../../config";
import duplicateSlugCheck from "../../middleware/duplicateSlugCheck";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_DOCUMENT_DESIGN;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        slug: {
          type: "string",
        },
        color: {
          type: "string",
        },
        name: {
          type: "string",
        },
        fields: {
          type: "object",
          default: {},
        },
      },
      required: ["slug", "name"],
    },
  },
  required: ["body"],
} as const;

export const RequsetCreateDocDesignBody = {
  title: "RequsetCreateDocDesignBody",
  RequsetCreateDocDesignBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { slug, name, color, fields } = event.body;
  const account_id: string = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: {
      id: `${account_id}:${ACCOUNT_DOCUMENT_DESIGN_TABLE_NAME}`,
      slug,
      name,
      color,
      fields,
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
  .use(
    duplicateSlugCheck({
      tableName: TABLE_NAME,
      accountPostfix: "sys_document_designs",
    })
  )
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
