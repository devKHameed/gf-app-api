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
import {
  ACCOUNT_VECTOR_KNOWLEDGEBASE_TOPICS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const tableName = envTableNames.DYNAMODB_ACCT_VECTOR_KNOWLEDGEBASE_TOPICS;

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
        },
        meta_data: {
          type: "object",
        },
        value: {
          type: "string",
        },
      },
      required: [], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId: string = event.headers["account-id"] as string;
    const slug = event.pathParameters!.slug;
    const vectorKnowledgebaseId =
      event.queryStringParameters!.vector_knowledgebase_id;
    const fields = event.body;

    const authToken = event.headers.authorization;

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        keys: {
          id: `${accountId}:${vectorKnowledgebaseId}:${ACCOUNT_VECTOR_KNOWLEDGEBASE_TOPICS_TABLE_NAME}`,
          slug: slug!,
        },
        tableName: tableName,
        item: fields,
      });

    await dynamodb.update(params);

    if (fields.value) {
      const pineconeRes = await axios
        .post(
          "https://bp4j9xidm3.execute-api.us-east-1.amazonaws.com/dataInsertionToPinecone",
          {
            knowledgebase_id: vectorKnowledgebaseId,
            data: [
              {
                topic_id: slug,
                topic_value: fields.value,
              },
            ],
          },
          {
            headers: {
              authorization: authToken,
            },
          }
        )
        .catch((err) => {
          console.log(
            "🚀 ~ file: createVectorKnowledgebaseTopic.ts:101 ~ >= ~ err:",
            err
          );
        });

      if (pineconeRes) {
        console.log(
          "🚀 ~ file: createVectorKnowledgebaseTopic.ts:103 ~ >= ~ pineconeRes:",
          JSON.stringify(pineconeRes, null, 2),
          JSON.stringify(pineconeRes.data, null, 2)
        );
      }
    }

    return {
      statusCode: 200,
      body: { message: "update successfully" },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
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
  );
