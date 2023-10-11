import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";

import DynamoDB from "aws-sdk/clients/dynamodb";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { ACCOUNT_USER_TYPES_TABLE_NAME, envTableNames } from "../../config";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();

const TABLE_NAME = envTableNames.DYNAMODB_ACCT_USER_TYPES;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
        fields: {
          type: "object",
          default: {},
        },
        permissions: {
          type: "object",
          default: {},
        },
      },
      required: [], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;
export const RequsetUpdateUserTypeBody = {
  title: "RequsetUpdateUserTypeBody",
  RequsetCreateUserTypeBody: eventSchema.properties.body,
};
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const account_id: string = event.headers["account-id"] as string;
    const slug = event.pathParameters!.slug;
    const fields = event.body;

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        keys: {
          id: `${account_id}:${ACCOUNT_USER_TYPES_TABLE_NAME}`,
          slug: slug!,
        },
        tableName: TABLE_NAME,
        item: fields,
      });

    await dynamoDb.update(params).promise();

    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "update successfully" },
    };
  } catch (error: unknown) {
    console.log(error);
    return {
      statusCode: 501,
      body: { message: "Couldn't update" },
    };
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
