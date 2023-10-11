import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const tableName = envTableNames.DYNAMODB_ACCT_FUSION_SETS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters?.slug as string;
  const accountId = event.headers["account-id"];

  try {
    const { Attributes = {} } = await dynamodb.delete({
      TableName: tableName,
      Key: {
        id: `${accountId}`,
        slug: slug,
      },
      ReturnValues: "ALL_OLD",
    });

    const isDeleted = 1;
    const newSlug = `${isDeleted}:${slug.slice(slug.indexOf(":") + 1)}`;

    await dynamodb.put({
      TableName: tableName,
      Item: {
        ...Attributes,
        id: `${accountId}`,
        slug: newSlug,
        is_deleted: isDeleted,
        updated_at: new Date().toISOString(),
      },
    });

    return {
      statusCode: 200,
      body: { message: "Gui deleted successfully" },
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
