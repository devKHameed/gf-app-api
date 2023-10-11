import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { FineTuneKnowledgebaseTopic } from "types";
import {
  ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TOPICS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";

const tableName = envTableNames.DYNAMODB_ACCT_FINE_TUNE_KNOWLEDGEBASE_TOPICS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  try {
    const slug = event.pathParameters!.slug;
    const accountId: string = event.headers["account-id"] as string;
    const fineTuneKnowledgebaseId =
      event.queryStringParameters!.finetune_knowledgebase_id;

    const paramsGet: DynamoDB.DocumentClient.GetItemInput = {
      TableName: tableName,
      Key: {
        id: `${accountId}:${fineTuneKnowledgebaseId}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TOPICS_TABLE_NAME}`,
        slug: slug,
      },
    };

    const { Item } = await dynamodb.get(paramsGet);
    const fineTuneKnowledgebaseTopic = Item as FineTuneKnowledgebaseTopic;

    fineTuneKnowledgebaseTopic.slug = fineTuneKnowledgebaseTopic.slug.replace(
      "false",
      "true"
    );
    fineTuneKnowledgebaseTopic.is_deleted = 1;

    await dynamodb.delete({
      TableName: tableName,
      Key: {
        id: `${accountId}:${fineTuneKnowledgebaseTopic}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TOPICS_TABLE_NAME}`,
        slug: slug,
      },
    });

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: tableName,
      Item: fineTuneKnowledgebaseTopic,
    };

    await dynamodb.put(params);

    return {
      statusCode: 200,
      body: { message: "Fine tune knowledgebase topic deleted successfully" },
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
