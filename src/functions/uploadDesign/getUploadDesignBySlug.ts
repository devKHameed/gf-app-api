import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createError, { HttpError } from "http-errors";
import { ACCOUNT_UPLOAD_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const tableName = envTableNames.DYNAMODB_ACCT_UPLOAD_DESIGN;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId: string = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.GetItemInput = {
    TableName: tableName,
    Key: {
      id: `${accountId}:${ACCOUNT_UPLOAD_DESIGN_TABLE_NAME}`,
      slug: slug,
    },
  };

  try {
    const { Item } = await dynamodb.get(params);

    if (Item?.is_deleted === 1) {
      throw createError(404, "upload design not found");
    }

    return {
      statusCode: 200,
      body: { data: Item },
    };
  } catch (error) {
    const err = error as HttpError;
    throw createError(err.status ?? err.statusCode ?? 500, err, {
      expose: true,
    });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(httpErrorHandler()) // handles common http errors and returns proper responses
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
