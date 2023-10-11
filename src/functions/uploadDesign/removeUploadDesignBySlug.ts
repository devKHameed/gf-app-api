import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createError from "http-errors";
import { ACCOUNT_UPLOAD_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { AccountUser } from "../../types";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const eventSchema = {
  type: "object",
  properties: {
    user: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const tableName = envTableNames.DYNAMODB_ACCT_UPLOAD_DESIGN;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId = event.headers["account-id"] as string;

  const user = event.user as AccountUser;

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: `${accountId}:${ACCOUNT_UPLOAD_DESIGN_TABLE_NAME}`,
        slug: slug!,
      },
      tableName: tableName,
      item: { is_deleted: 1 },
    }
  );

  try {
    await createUniversalEvent({
      recordId: slug!,
      recordType: "upload_design",
      accountId: accountId,
      eventSlug: "delete",
      eventData: {},
      userId: user.slug,
    });

    await dynamodb.update(params);

    return {
      statusCode: 200,
      body: { message: "Upload design deleted successfully" },
    };
  } catch (error) {
    const err = error as Error;
    throw createError(500, err, { expose: true });
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
