import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import {
  ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_MESSAGES_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";

const tableName = envTableNames.DYNAMODB_ACCT_FINE_TUNE_KNOWLEDGEBASE_MESSAGES;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  try {
    const slug = event.pathParameters!.slug;
    const accountId: string = event.headers["account-id"] as string;

    const params: DynamoDB.DocumentClient.QueryInput = {
      TableName: tableName,
      IndexName: "is_deleted_lsi",
      KeyConditionExpression: "#id = :id",
      ExpressionAttributeNames: {
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${slug}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_MESSAGES_TABLE_NAME}`,
      },
    };

    const { Items } = await dynamodb.query(params);

    return {
      statusCode: 200,
      body: { data: Items },
    };
  } catch (error: unknown) {
    return {
      statusCode: 501,
      body: { message: "Couldn't get" },
    };
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
