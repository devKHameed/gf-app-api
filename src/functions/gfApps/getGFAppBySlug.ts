import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { GFApp } from "types";
import { ACCOUNT_GF_APPS, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_GF_APPS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;
  const account_id: string = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.GetItemInput = {
    TableName: TABLE_NAME,
    Key: {
      id: `${account_id}:${ACCOUNT_GF_APPS}`,
      slug: slug,
    },
  };

  try {
    const { Item } = await dynamoDb.get(params).promise();
    const gfApp: GFApp = Item as GFApp;
    return {
      statusCode: 200,
      body: { data: gfApp },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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