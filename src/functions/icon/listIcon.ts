import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames, MASTER_ACCOUNT_ID } from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const tableName = envTableNames.DYNAMODB_SYS_ICONS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const accountId: string = event.headers["account-id"] as string;
  try {
    if (accountId === MASTER_ACCOUNT_ID) {
      const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey;
      const exclusiveStartKey = lastEvaluatedKey
        ? JSON.parse(lastEvaluatedKey)
        : undefined;
      const { Items = [], LastEvaluatedKey } = await dynamodb.query({
        TableName: tableName,
        IndexName: "is_deleted_lsi",
        KeyConditionExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
        },
        ExpressionAttributeValues: {
          ":is_deleted": 0,
        },
        ExclusiveStartKey: exclusiveStartKey,
      });

      return {
        statusCode: 200,
        body: { icons: Items, lastEvaluatedKey: LastEvaluatedKey },
      };
    }

    const { Items: nativeIcons = [] } = await dynamodb.query({
      TableName: tableName,
      IndexName: "is_deleted_lsi",
      KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#id": "id",
        "#is_deleted": "is_deleted",
      },
      ExpressionAttributeValues: {
        ":id": "n",
        ":is_deleted": 0,
      },
    });
    const { Items: systemIcons = [] } = await dynamodb.query({
      TableName: tableName,
      IndexName: "is_deleted_lsi",
      KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#id": "id",
        "#is_deleted": "is_deleted",
      },
      ExpressionAttributeValues: {
        ":id": "s",
        ":is_deleted": 0,
      },
    });
    const { Items: customIcons = [] } = await dynamodb.query({
      TableName: tableName,
      IndexName: "is_deleted_lsi",
      KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#id": "id",
        "#is_deleted": "is_deleted",
      },
      ExpressionAttributeValues: {
        ":id": `c:${accountId}`,
        ":is_deleted": 0,
      },
    });
    return {
      statusCode: 200,
      body: { data: [...nativeIcons, ...systemIcons, ...customIcons] },
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
