import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";

import DynamoDB from "aws-sdk/clients/dynamodb";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import {
  ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME,
  envTableNames,
} from "../../config";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_FINE_TUNE_KNOWLEDGEBASE;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  try {
    const accountId: string = event.headers["account-id"] as string;

    const params: DynamoDB.DocumentClient.QueryInput = {
      TableName: TABLE_NAME,
      IndexName: "is_deleted_lsi",
      KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#id": "id",
        "#is_deleted": "is_deleted",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME}`,
        ":is_deleted": 0,
      },
    };

    // fetch data from the database
    const { Items } = await dynamoDb.query(params).promise();
    return {
      statusCode: 200,
      body: { message: "List of fine tune knowledgebases", data: Items },
    };
  } catch (error: unknown) {
    return {
      statusCode: 501,
      body: { message: "Error while fetch list" },
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
