import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import jwt from "jsonwebtoken";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountUser } from "types";
import {
  ACCOUNT_DATASET_DESIGN_TABLE_NAME,
  envTableNames,
  SYSTEM_USERS,
} from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_DATASET_DESIGN;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId = event.headers["account-id"] as string;

  const {
    headers: { authorization },
  } = event;
  const token = authorization!.replace("Bearer ", "");
  const tUser = jwt.decode(token) as { email: string };

  const { Items } = await dynamoDb
    .query({
      TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
      IndexName: "email_lsi_index",
      KeyConditionExpression: "#id = :id AND #email = :email",
      ExpressionAttributeNames: {
        "#id": "id",
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":id": SYSTEM_USERS,
        ":email": tUser.email,
      },
      ProjectionExpression: "slug",
    })
    .promise();
  const User = Items?.[0] as AccountUser;

  if (!User?.slug) throw createError("user does not exists!");

  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      keys: {
        id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
        slug: slug!,
      },
      tableName: TABLE_NAME,
      item: { is_deleted: 1 },
    }
  );

  try {
    await createUniversalEvent({
      recordId: slug!,
      recordType: "dataset_design",
      accountId: accountId,
      eventSlug: "delete",
      eventData: {},
      userId: User.slug,
    });

    await dynamoDb.update(params).promise();

    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "Dataset design deleted successfully" },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
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
  )
  .handler(lambdaHandler);
