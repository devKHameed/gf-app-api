import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createError from "http-errors";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const tableName = envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const accountId: string = event.headers["account-id"] as string;
  const uploadDesignSlug = event.pathParameters?.slug as string;

  if (!uploadDesignSlug) {
    throw createError(400, "Missing Upload Design Slug");
  }

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: tableName,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
      ":slug": `${accountId}:${uploadDesignSlug}`,
    },
  };

  try {
    const { Items } = await dynamodb.query(params);

    return {
      statusCode: 200,
      body: { message: "List of imports", data: Items },
    };
  } catch (error: unknown) {
    const err = error as Error;
    throw createError(500, err, { expose: true });
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
