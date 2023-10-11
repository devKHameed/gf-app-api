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
import { SEAT_TYPES, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

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
        description: {
          type: "string",
          default: "",
        },
        default_startup_qty: {
          type: "number",
          default: 0,
        },
        default_monthly_qty: {
          type: "number",
          default: 0,
        },
        default_additional_qty: {
          type: "number",
          default: 0,
        },
        default_additional_increment: {
          type: "number",
          default: 0,
        },
      },
      required: [],
    },
  },
  required: ["body"],
} as const;

export const RequsetUpdateGuiBody = {
  title: "RequsetUpdateGuiBody",
  RequsetUpdateGuiBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const fields = event.body;

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: SEAT_TYPES,
        slug: slug!,
      },
      tableName: envTableNames.DYNAMODB_SEAT_TYPES,
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
  .handler(lambdaHandler);