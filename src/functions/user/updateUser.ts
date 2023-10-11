import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";

import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import jwt from "jsonwebtoken";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames, SYSTEM_USERS } from "../../config";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();

const TABLE_NAME = envTableNames.DYNAMODB_SYS_USERS_TABLE;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        first_name: {
          type: "string",
        },
        last_name: {
          type: "string",
        },
        phone: {
          type: "string",
        },
      },
    },
    additionalProperties: false,
  },
  required: ["body"],
} as const;

export const RequsetUpdateUserBody = {
  title: "RequsetUpdateUserBody",
  RequsetUpdateUserBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const {
    headers: { authorization },
  } = event;

  const token: string = authorization!.replace("Bearer ", "");
  const tokenUser = jwt.decode(token) as { email: string };

  const fields = event.body;

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: SYSTEM_USERS,
        slug: tokenUser.email,
      },
      tableName: TABLE_NAME,
      item: fields,
    }
  );
  try {
    await dynamoDb.update(params).promise();

    return {
      status: 200,
      body: { message: "update successfully" },
    };
  } catch (error: unknown) {
    console.log(error);
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
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
