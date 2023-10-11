import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountUser } from "types";
import { ACCOUNT_USER_SUBSCRIPTION, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_SYS_USERS_TABLE;
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const accountId = event.headers["account-id"] as string;
  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: TABLE_NAME,
  };

  try {
    // fetch data from the database
    const { Items } = await dynamoDb.scan(params).promise();

    for (const obj of Items as AccountUser[]) {
      const association = await dynamoDb
        .query({
          TableName: envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
          IndexName: "user_id_gsi_index",
          KeyConditionExpression: "#id = :id AND #user_id = :user_id",
          ExpressionAttributeNames: {
            "#id": "id",
            "#user_id": "user_id",
          },
          ExpressionAttributeValues: {
            ":id": `${accountId}:${ACCOUNT_USER_SUBSCRIPTION}`,
            ":user_id": obj.slug,
          },
        })
        .promise();

      if (association.Items?.length) {
        // extraData.Keys = Keys;
        obj.subscription = association.Items[0];
      } else {
        obj.subscription = {};
      }
    }

    return {
      statusCode: 200,
      body: { message: "List of users", data: Items },
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
