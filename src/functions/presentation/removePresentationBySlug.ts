import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";

import DynamoDB from "aws-sdk/clients/dynamodb";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { ACCOUNT_PRESNTATIONS_TABLE_NAME, envTableNames } from "../../config";

import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();

const TABLE_NAME = envTableNames.DYNAMODB_ACCT_PRESENTATIONS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  try {
    const slug = event.pathParameters!.slug;
    const accountId: string = event.headers["account-id"] as string;

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        keys: {
          id: `${accountId}:${ACCOUNT_PRESNTATIONS_TABLE_NAME}`,
          slug: slug!,
        },
        tableName: TABLE_NAME,
        item: { is_deleted: 1 },
      });

    await dynamoDb.update(params).promise();

    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "Presentation deleted successfully" },
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
