import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";

const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const tableName = `${envTableNames.DYNAMODB_GF_OPERATORS}`;

export const handler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const Items = await dynamodb
      .query({
        TableName: tableName,
        FilterExpression: "#is_deleted = :is_deleted",
        KeyConditionExpression: "#id = :id",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
        },
        ExpressionAttributeValues: {
          ":id": "gfml_groups",
          ":is_deleted": false,
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: {
        data: Items.Items,
        count: Items.Count,
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};
