import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { SKILL_INTENTS_TABLE_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;

  const params: DynamoDB.DocumentClient.DeleteItemInput = {
    Key: {
      id: `${SKILL_INTENTS_TABLE_NAME}`,
      slug: slug!,
    },
    TableName: envTableNames.DYNAMODB_SKILL_INTENTS,
  };

  try {
    await dynamoDb.delete(params).promise();
    return {
      statusCode: 200,
      body: { message: "deleted successfully" },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
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
