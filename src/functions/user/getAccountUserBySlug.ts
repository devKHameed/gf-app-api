import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import {
  ACCOUNT_USER_SUBSCRIPTION,
  envTableNames,
  SYSTEM_USERS,
} from "../../config";

const dynamoDb = new DynamoDB.DocumentClient();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;
  const account_id: string = event.headers["account-id"] as string;

  const userParams: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
    Key: {
      id: SYSTEM_USERS,
      slug: slug,
    },
  };

  const userSubscription: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
    Key: {
      id: `${account_id}:${ACCOUNT_USER_SUBSCRIPTION}`,
      user_id: slug,
    },
  };

  try {
    const [userRes, SubRes] = await Promise.all([
      dynamoDb.get(userParams).promise(),
      dynamoDb.get(userSubscription).promise(),
    ]);

    //TODO: Add condition if the item doens't exist
    return {
      statusCode: 200,
      body: { data: { ...userRes.Item, subscription: SubRes.Item } },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
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
