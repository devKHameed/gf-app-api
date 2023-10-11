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
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_DOCUMENT_DESIGN;

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
        },
        fields: {
          type: "object",
        },
      },
    },
  },
  required: ["body"],
} as const;

export const RequsetUpdateDocDesignBody = {
  title: "RequsetUpdateDocDesignBody",
  RequsetUpdateDocDesignBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const account_id = event.headers["account-id"] as string;
  const { name, color, fields } = event.body;

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      tableName: TABLE_NAME,
      keys: {
        id: `${account_id}:${ACCOUNT_DOCUMENT_DESIGN_TABLE_NAME}`,
        slug: slug!,
      },
      item: {
        name,
        color,
        fields,
      },
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
  ); // handles common http errors and returns proper responses
