import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_FUSION_FLOWS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId: string = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: `${accountId}:fusion_flows`,
        slug: slug!,
      },
      tableName: TABLE_NAME,
      item: { is_deleted: 1 },
    }
  );

  try {
    await dynamoDb.update(params).promise();

    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "Fusion deleted successfully" },
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
