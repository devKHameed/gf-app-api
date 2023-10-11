import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountSubscription, AccountUser } from "types";
import {
  ACCOUNT_USER_SUBSCRIPTION,
  envTableNames,
  SYSTEM_USERS,
} from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION;
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const accountId = event.headers["account-id"] as string;

  try {
    // fetch data from the database
    //const { Items } = await dynamoDb.scan(params).promise();

    const { Items: associations } = await dynamoDb
      .query({
        TableName: envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
        KeyConditionExpression: "#id = :id",
        ExpressionAttributeNames: {
          "#id": "id",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:${ACCOUNT_USER_SUBSCRIPTION}`,
        },
      })
      .promise();

    const users = [];

    for (const obj of associations as AccountSubscription[]) {
      const { Items } = await dynamoDb
        .query({
          TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
          KeyConditionExpression: "#id = :id AND #slug = :slug",
          ExpressionAttributeNames: {
            "#id": "id",
            "#slug": "slug",
          },
          ExpressionAttributeValues: {
            ":id": SYSTEM_USERS,
            ":slug": obj.user_id,
          },
          ProjectionExpression:
            "id, slug, email, phone, first_name, last_name, image, created_at, updated_at, is_deleted",
        })
        .promise();
      const User = Items?.[0] as AccountUser;
      User.subscription = obj;
      users.push(User);
    }

    return {
      statusCode: 200,
      body: { message: "List of users", data: users },
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
