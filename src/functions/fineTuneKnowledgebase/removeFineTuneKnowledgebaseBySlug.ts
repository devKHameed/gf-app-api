import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { FineTuneKnowledgebase } from "types";
import {
  ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME,
  envTableNames,
} from "../../config";

const dynamoDb = new DynamoDB.DocumentClient();

const TABLE_NAME = envTableNames.DYNAMODB_ACCT_FINE_TUNE_KNOWLEDGEBASE;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  try {
    const slug = event.pathParameters!.slug;
    const accountId: string = event.headers["account-id"] as string;

    const paramsGet: DynamoDB.DocumentClient.GetItemInput = {
      TableName: TABLE_NAME,
      Key: {
        id: `${accountId}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME}`,
        slug: slug,
      },
    };

    const { Item } = await dynamoDb.get(paramsGet).promise();
    const fineTuneKnowledgebase = Item as FineTuneKnowledgebase;

    fineTuneKnowledgebase.slug = fineTuneKnowledgebase.slug.replace(
      "false",
      "true"
    );
    fineTuneKnowledgebase.is_deleted = 1;

    await dynamoDb
      .delete({
        TableName: TABLE_NAME,
        Key: {
          id: `${accountId}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME}`,
          slug: slug,
        },
      })
      .promise();

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: TABLE_NAME,
      Item: fineTuneKnowledgebase,
    };

    await dynamoDb.put(params).promise();

    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "Fine Tune knowledgebase deleted successfully" },
    };
  } catch (error: unknown) {
    console.log(error);
    return {
      statusCode: 501,
      body: { message: "Couldn't delete" },
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
