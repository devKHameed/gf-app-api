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
    const body = event.body;
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

    const now = new Date().toISOString();
    const tableParams: DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: tableName,
      UpdateExpression: "",
      ExpressionAttributeValues: {},
      Key: {
        id: "gfml_groups",
        slug: id,
      },
    };

    let prefix = "set ";
    const attributes = Object.keys(body);
    for (let i = 0; i < attributes.length; i++) {
      const attribute = attributes[i];
      tableParams["UpdateExpression"] +=
        prefix + "" + attribute + " = :" + attribute;
      tableParams["ExpressionAttributeValues"]![":" + attribute] =
        body[attribute];
      prefix = ", ";
    }

    tableParams["UpdateExpression"] += prefix + "updated_at" + " = :updated_at";
    tableParams["ExpressionAttributeValues"]![":updated_at"] = now;

    await dynamodb.update(tableParams).promise();
    return {
      statusCode: 200,
      body: {
        message: "Table updated successfully",
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};
