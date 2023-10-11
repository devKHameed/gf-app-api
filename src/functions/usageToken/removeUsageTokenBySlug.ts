import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountUser, UsageToken } from "types";
import { ACCOUNT_USAGE_TOKENS_TABLE_NAME, envTableNames } from "../../config";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_PORTAL_OFFERS;

const eventSchema = {
  type: "object",
  properties: {},
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId = event.headers["account-id"] as string;

  const paramsGet: DynamoDB.DocumentClient.GetItemInput = {
    TableName: TABLE_NAME,
    Key: {
      id: `${accountId}:${ACCOUNT_USAGE_TOKENS_TABLE_NAME}`,
      slug: slug,
    },
  };

  const { Item } = await dynamoDb.get(paramsGet).promise();
  const usageToken = Item as UsageToken;

  usageToken.slug = usageToken.slug.replace("false", "true");
  usageToken.is_deleted = 1;

  await dynamoDb
    .delete({
      TableName: TABLE_NAME,
      Key: {
        id: `${accountId}:${ACCOUNT_USAGE_TOKENS_TABLE_NAME}`,
        slug: slug,
      },
    })
    .promise();

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: usageToken,
  };

  try {
    await createUniversalEvent({
      recordId: slug!,
      recordType: "usage_token_record",
      accountId: accountId,
      eventSlug: "delete",
      eventData: {},
      userId: (event.user as AccountUser).slug,
    });

    await dynamoDb.put(params).promise();

    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "Usage token deleted successfully" },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(getUser())
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
