import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
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
    const body = event.body;

    const now = new Date().toISOString();
    const tableParams = {
      TableName: tableName,
      Item: {
        id: "gfml_groups",
        slug: v4(),
        group_slug: body.group_slug,
        group_icon: body.group_icon,
        group_subgroups: body.group_subgroups,
        is_active: body.is_active,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      },
    };
    await dynamodb.put(tableParams).promise();

    return {
      statusCode: 200,
      body: {
        data: tableParams.Item,
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};
