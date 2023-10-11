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
  ACCOUNT_USER_SUBSCRIPTION,
  SYSTEM_USERS,
  envTableNames,
} from "../../config";
import buildUpdateExpression from "../../util/buildUpdateExpression";
const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        seat_type_id: {
          type: "string",
        },
        template_id: {
          type: "string",
        },
        permissions: {
          type: "object"
        }
      },
    },
    additionalProperties: true,
  },
  required: ["body"],
} as const;

export const RequsetUpdateAccountUserBody = {
  title: "RequsetUpdateAccountUserBody",
  RequsetUpdateAccountUserBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const slug = event.pathParameters!.slug;
    const { seat_type_id, permissions, template_id, ...rest } = event.body;
    const account_id: string = event.headers["account-id"] as string;

    if (seat_type_id || template_id || permissions) {
      const params: DynamoDB.DocumentClient.UpdateItemInput =
        buildUpdateExpression({
          keys: {
            id: `${account_id}:${ACCOUNT_USER_SUBSCRIPTION}`,
            user_id: slug!,
          },
          tableName: envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
          item: { seat_type_id, template_id, permissions },
        });

      await dynamoDb.update(params).promise();
    }

    if (Object.keys(rest).length > 0) {
      const params: DynamoDB.DocumentClient.UpdateItemInput =
        buildUpdateExpression({
          keys: {
            id: `${SYSTEM_USERS}`,
            slug: slug!,
          },
          tableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
          item: rest,
        });
      await dynamoDb.update(params).promise();
    }

    //TODO: If user need send back the data
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
