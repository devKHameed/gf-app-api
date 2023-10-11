import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
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

const tableName = envTableNames.DYNAMODB_ACCT_UPLOAD_DESIGN;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        title: {
          type: "string",
        },
        sample_file: {
          type: "object",
        },
      },
    },
    user: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId = event.headers["account-id"] as string;

  const user = event.user as AccountUser;

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      tableName: tableName,
      keys: {
        id: `${accountId}:${ACCOUNT_UPLOAD_DESIGN_TABLE_NAME}`,
        slug: slug!,
      },
      item: event.body,
    }
  );

  try {
    await createUniversalEvent({
      recordId: slug!,
      recordType: "upload_design",
      accountId: accountId,
      eventSlug: "edit",
      eventData: event.body,
      userId: user.slug,
    });

    await dynamodb.update(params);

    return {
      statusCode: 200,
      body: { message: "update successfully" },
    };
  } catch (error) {
    const err = error as Error;
    throw createError(500, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser())
  .use(validator({ eventSchema }))
  .use(getUser())
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
