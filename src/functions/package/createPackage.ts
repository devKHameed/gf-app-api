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
import { PACKAGES, envTableNames } from "../../config";
import duplicateSlugCheck from "../../middleware/duplicateSlugCheck";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        slug: {
          type: "string",
        },
        name: {
          type: "string",
        },
        description: {
          type: "string",
          default: "",
        },
        startup_cost: {
          type: "number",
          default: 0,
        },
        monthly_cost: {
          type: "number",
          default: 0,
        },
      },
      required: ["name", "slug"],
    },
  },
  required: ["body"],
} as const;

export const RequsetCreateGuiBody = {
  title: "RequsetCreateGuiBody",
  RequsetCreateGuiBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const body = event.body;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_PACKAGES,
    Item: {
      id: PACKAGES,
      ...body,
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
    duplicateSlugCheck({
      tableName: envTableNames.DYNAMODB_CREDIT_TYPES,
      getKey: (_, slug) => ({ id: PACKAGES, slug }),
    })
  )
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
