import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { AWSError } from "aws-sdk";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createError from "http-errors";
import { AccountUser, FineTuneKnowledgebase } from "types";
import { v4 } from "uuid";
import {
  ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_MESSAGES_TABLE_NAME,
  ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const tableName = envTableNames.DYNAMODB_ACCT_FINE_TUNE_KNOWLEDGEBASE_MESSAGES;
const knowledgebaseTableName =
  envTableNames.DYNAMODB_ACCT_FINE_TUNE_KNOWLEDGEBASE;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        message: {
          type: "string",
        },
      },
      required: ["message"],
    },
  },
  required: ["body"],
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  console.log(
    "🚀 ~ file: createMessage.ts:41 ~ >= ~ event:",
    JSON.stringify(event, null, 2)
  );
  try {
    const slug = event.pathParameters!.slug;
    const accountId: string = event.headers["account-id"] as string;
    const user = event.user as AccountUser;

    // const authToken = event.headers.authorization;

    const { message } = event.body;
    console.log("🚀 ~ file: createMessage.ts:49 ~ >= ~ message:", message);

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: tableName,
      Item: {
        id: `${accountId}:${slug}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_MESSAGES_TABLE_NAME}`,
        slug: `false:${v4()}`,
        data: message,
        sent_by: "user",
        user_data: {
          slug: user.slug,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          image: user.image,
        },
        created_at: new Date().toISOString(),
        updated_at: null,
        is_active: 1,
        is_deleted: 0,
      },
    };
    await dynamodb.put(params);

    const { Item } = await dynamodb.get({
      TableName: knowledgebaseTableName,
      Key: {
        id: `${accountId}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME}`,
        slug,
      },
    });

    const knowledgebase = Item as FineTuneKnowledgebase;
    console.log(
      "🚀 ~ file: createMessage.ts:89 ~ >= ~ knowledgebase:",
      knowledgebase
    );

    // const pineconeRes = await axios.request({
    //   url: "https://bp4j9xidm3.execute-api.us-east-1.amazonaws.com/queryPinecone",
    //   method: "POST",
    //   data: {
    //     knowledgebase_id: knowledgebase.pinecone_index,
    //     query: message,
    //   },
    //   headers: {
    //     authorization: authToken,
    //   },
    // });

    // if (pineconeRes?.data) {
    //   console.log(
    //     "🚀 ~ file: createFineTuneKnowledgebaseTopic.ts:103 ~ >= ~ pineconeRes:",
    //     JSON.stringify(pineconeRes.data, null, 2)
    //   );
    //   const responseParams: DynamoDB.DocumentClient.PutItemInput = {
    //     TableName: tableName,
    //     Item: {
    //       id: `${accountId}:${slug}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_MESSAGES_TABLE_NAME}`,
    //       slug: `false:${v4()}`,
    //       data: pineconeRes.data.body || "",
    //       sent_by: "bot",
    //       created_at: new Date().toISOString(),
    //       updated_at: null,
    //       is_active: 1,
    //       is_deleted: 0,
    //     },
    //   };
    //   await dynamodb.put(responseParams);
    //   return {
    //     statusCode: 200,
    //     body: {
    //       data: { user_message: params.Item, response: responseParams.Item },
    //     },
    //   };
    // } else {
    //   return {
    //     statusCode: 200,
    //     body: { data: { user_message: params.Item } },
    //   };
    // }
  } catch (error: unknown) {
    console.log(error);
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(getUser())
  .use(jsonschemaErrors())
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
  )
  .handler(lambdaHandler);
