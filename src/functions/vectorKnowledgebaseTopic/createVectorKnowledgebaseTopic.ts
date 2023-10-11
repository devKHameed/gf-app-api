import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import axios from "axios";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
import {
  ACCOUNT_VECTOR_KNOWLEDGEBASE_TABLE_NAME,
  ACCOUNT_VECTOR_KNOWLEDGEBASE_TOPICS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { VectorKnowledgebase } from "../../types";

const tableName = envTableNames.DYNAMODB_ACCT_VECTOR_KNOWLEDGEBASE_TOPICS;
const knowledgebaseTableName = envTableNames.DYNAMODB_ACCT_VECTOR_KNOWLEDGEBASE;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
        description: {
          type: "string",
          default: "",
        },
        meta_data: {
          type: "object",
          default: {},
        },
        value: {
          type: "string",
          default: "",
        },
      },
      required: ["name"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const { name, description, meta_data, value } = event.body;
    const accountId: string = event.headers["account-id"] as string;
    const vectorKnowledgebaseId =
      event.queryStringParameters!.vector_knowledgebase_id;

    const authToken = event.headers.authorization;

    const topicSlug = `false:${v4()}`;

    const { Item } = await dynamodb.get({
      TableName: knowledgebaseTableName,
      Key: {
        id: `${accountId}:${ACCOUNT_VECTOR_KNOWLEDGEBASE_TABLE_NAME}`,
        slug: vectorKnowledgebaseId,
      },
    });

    const knowledgebase = Item as VectorKnowledgebase;
    console.log(
      "🚀 ~ file: createVectorKnowledgebaseTopic.ts:75 ~ >= ~ knowledgebase:",
      knowledgebase
    );

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: tableName,
      Item: {
        id: `${accountId}:${vectorKnowledgebaseId}:${ACCOUNT_VECTOR_KNOWLEDGEBASE_TOPICS_TABLE_NAME}`,
        slug: topicSlug,
        name,
        description,
        meta_data,
        value,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_active: 1,
        is_deleted: 0,
      },
    };
    console.log(
      "🚀 ~ file: createVectorKnowledgebaseTopic.ts:92 ~ >= ~ params:",
      params
    );

    // write a organization to the database
    await dynamodb.put(params);

    console.log("topic created");

    const pineconeRes = await axios
      .request({
        url: "https://bp4j9xidm3.execute-api.us-east-1.amazonaws.com/dataInsertionToPinecone",
        method: "POST",
        data: {
          knowledgebase_id: knowledgebase.pinecone_index,
          data: [
            {
              topic_id: topicSlug,
              topic_value: value,
            },
          ],
        },
        headers: {
          authorization: authToken,
        },
      })
      .catch((err) => {
        console.log(
          "🚀 ~ file: createVectorKnowledgebaseTopic.ts:101 ~ >= ~ err:"
        );
        console.log(err);
      });

    if (pineconeRes) {
      console.log(
        "🚀 ~ file: createVectorKnowledgebaseTopic.ts:103 ~ >= ~ pineconeRes:",
        JSON.stringify(pineconeRes.data, null, 2)
      );
    }

    return {
      statusCode: 201,
      body: { data: params.Item },
    };
  } catch (error: unknown) {
    console.log(error);
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
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
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
