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
  const account_id = event.headers["account-id"] as string;

  const params_get: DynamoDB.DocumentClient.GetItemInput = {
    TableName: TABLE_NAME,
    Key: {
      id: `${account_id}:${ACCOUNT_GF_APPS}`,
      slug: slug,
    },
  };

  try {
    const { Item } = await dynamoDb.get(params_get).promise();
    const gfApp = Item as GFApp;

    gfApp.slug = gfApp.slug.replace("false", "true");
    gfApp.is_deleted = 1;

    await dynamoDb
      .delete({
        TableName: TABLE_NAME,
        Key: {
          id: `${account_id}:${ACCOUNT_GF_APPS}`,
          slug: slug,
        },
      })
      .promise();

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: TABLE_NAME,
      Item: gfApp,
    };

    await dynamoDb.put(params).promise();

    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "GF App deleted successfully" },
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
