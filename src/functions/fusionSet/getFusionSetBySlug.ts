import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const tableName = envTableNames.DYNAMODB_ACCT_FUSION_SETS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId = event.headers["account-id"];

  const params: DynamoDB.DocumentClient.GetItemInput = {
    TableName: tableName,
    Key: {
      id: `${accountId}`,
      slug: slug,
    },
  };

  try {
    const { Item } = await dynamodb.get(params);
    return {
      statusCode: 200,
      body: { data: Item },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
