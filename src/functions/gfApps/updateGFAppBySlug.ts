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
import { ACCOUNT_GF_APPS, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_GF_APPS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
          type: "object",
        },
        color: {
          type: "string",
        },
        icon: {
          type: "string",
        },
        language: {
          type: "string",
        },
        audience: {
          type: "string",
        },
        description: {
          type: "string",
        },
        current_version: {
          type: "string",
        },
        child_gui: {
          type: "object",
        },
        child_fusions: {
          type: "object",
        },
        required_plugins: {
          type: "object",
        },
        associated_documents: {
          type: "object",
        },
        parent_app_id: {
          type: "number",
        },
        parent_folder_id: {
          type: "string",
        },
        sort_order: {
          type: "number",
        },
      },
      required: [],
    },
  },
  required: ["body"],
} as const;
export const RequsetUpdateGFAppBody = {
  title: "RequsetUpdateGFAppBody",
  RequsetUpdateGFAppBody: eventSchema.properties.body,
};
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const fields = event.body;
  const account_id = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: `${account_id}:${ACCOUNT_GF_APPS}`,
        slug: slug!,
      },
      tableName: TABLE_NAME,
      item: fields,
    }
  );

  try {
    await dynamoDb.update(params).promise();

    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "update successfully" },
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
  );
