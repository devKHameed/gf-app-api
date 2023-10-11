import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";

import DynamoDB from "aws-sdk/clients/dynamodb";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import {
  ACCOUNT_VECTOR_KNOWLEDGEBASE_TOPICS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";

const tableName = envTableNames.DYNAMODB_ACCT_VECTOR_KNOWLEDGEBASE_TOPICS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  try {
    const accountId: string = event.headers["account-id"] as string;
    const vectorKnowledgebaseId =
      event.queryStringParameters!.vector_knowledgebase_id;

    const params: DynamoDB.DocumentClient.QueryInput = {
      TableName: tableName,
      IndexName: "is_deleted_lsi",
      KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#id": "id",
        "#is_deleted": "is_deleted",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${vectorKnowledgebaseId}:${ACCOUNT_VECTOR_KNOWLEDGEBASE_TOPICS_TABLE_NAME}`,
        ":is_deleted": 0,
      },
    };

    // fetch data from the database
    const { Items } = await dynamodb.query(params);
    return {
      statusCode: 200,
      body: { message: "List of vector knowledgebase topics", data: Items },
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
