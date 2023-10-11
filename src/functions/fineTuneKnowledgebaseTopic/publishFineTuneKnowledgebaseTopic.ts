import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { S3 } from "aws-sdk";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import axios from "axios";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import {
  ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME,
  ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TOPICS_TABLE_NAME,
  FINETUNE_BUCKET_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const tableName = envTableNames.DYNAMODB_ACCT_FINE_TUNE_KNOWLEDGEBASE_TOPICS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        finetune_Knowledgebase_id: {
          type: "string",
        },
      },
      required: ["finetune_Knowledgebase_id"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const s3 = new S3({
  signatureVersion: "v4",
  region: "us-east-1",
});

const BUCKET_NAME = FINETUNE_BUCKET_NAME;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const { finetune_Knowledgebase_id } = event.body;
    const accountId: string = event.headers["account-id"] as string;
    const fineTuneKnowledgebaseId = finetune_Knowledgebase_id;

    const authToken = event.headers.authorization;

    const params: DynamoDB.DocumentClient.QueryInput = {
      TableName: tableName,
      IndexName: "is_deleted_lsi",
      KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#id": "id",
        "#is_deleted": "is_deleted",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${fineTuneKnowledgebaseId}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TOPICS_TABLE_NAME}`,
        ":is_deleted": 0,
      },
    };

    const { Items: fineTuneKnowledgebases = [] } = await dynamodb.query(params);

    const topics = [];

    for (const item of fineTuneKnowledgebases) {
      topics.push({ prompt: item.question, completion: item.answer });
    }

    await s3
      .putObject({
        Body: Buffer.from(JSON.stringify(topics)),
        Bucket: BUCKET_NAME,
        Key: `${fineTuneKnowledgebaseId}.json`,
        ContentType: "application/json",
        ContentEncoding: "base64",
      })
      .promise();

    const finetuneModel = await axios
      .request({
        url: "https://bp4j9xidm3.execute-api.us-east-1.amazonaws.com/finetunemodelcreate",
        method: "POST",
        data: {
          model: "davinci",
          s3_path: `${fineTuneKnowledgebaseId}.json`,
        },
        headers: {
          authorization: authToken,
        },
      })
      .catch((err) => {
        console.log(
          "🚀 ~ file: publicFineTuneKnowledgebaseTopic.ts:101 ~ >= ~ err:"
        );
        console.log(err);
      });

    if (finetuneModel) {
      console.log(
        "🚀 ~ file: publicFineTuneKnowledgebaseTopic.ts:109 ~ >= ~ pineconeRes:",
        JSON.stringify(finetuneModel.data, null, 2)
      );

      const params: DynamoDB.DocumentClient.UpdateItemInput =
        buildUpdateExpression({
          keys: {
            id: `${accountId}:${ACCOUNT_FINE_TUNE_KNOWLEDGEBASE_TABLE_NAME}`,
            slug: fineTuneKnowledgebaseId,
          },
          tableName: envTableNames.DYNAMODB_ACCT_FINE_TUNE_KNOWLEDGEBASE,
          item: { fine_tuned_model_id: finetuneModel.data.fine_tuned_model_id },
        });
      console.log(params);
      await dynamodb.update(params);
    }

    return {
      statusCode: 201,
      body: { data: "Successfull." },
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
