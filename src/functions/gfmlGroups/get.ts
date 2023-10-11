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
    const { id = "" } = event.pathParameters || {};
    if (!id) {
      throw {
        message: [{ key: "id", value: "id is required" }],
        code: 421,
      };
    }

    const { Item } = await dynamodb
      .get({
        TableName: tableName,
        Key: {
          id: "gfml_groups",
          slug: id,
        },
      })
      .promise();
    if (!Item) {
      throw {
        message: `GFML Group doesn't exists against this id=${id}`,
        code: 404,
      };
    }

    return {
      statusCode: 200,
      body: {
        data: Item,
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};
