import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account } from "types";
import { ACCOUNTS_TABLE_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const account_id: string = event.headers["account-id"] as string;
  const slug = event.pathParameters!.slug;

  try {
    const { Item } = await dynamoDb
      .get({
        TableName: TABLE_NAME,
        Key: {
          id: ACCOUNTS_TABLE_NAME,
          slug: account_id,
        },
      })
      .promise();
    const account = Item as Account;

    const stripe_card = account.stripe_card?.find((i) => i.id === slug);
    if (!stripe_card) throw createError(400, "card does not exist");
    await dynamoDb
      .update(
        buildUpdateExpression({
          keys: {
            id: ACCOUNTS_TABLE_NAME,
            slug: account_id,
          },
          tableName: TABLE_NAME,
          item: {
            stripe_card: account.stripe_card?.map((i) => {
              i.primary = i.id === slug ? true : false;
              return i;
            }),
          },
        })
      )
      .promise();

    //TODO: If user need send back the data
    return {
      body: { message: "Account deleted successfully" },
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
