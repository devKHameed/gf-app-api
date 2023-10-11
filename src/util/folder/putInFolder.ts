import * as uuid from "uuid";
// import some middlewares
import DynamoDB from "aws-sdk/clients/dynamodb";
import { FOLDERS, envTableNames } from "../../config";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const putInFolder = async ({
  accountId,
  slug,
  folderPrefix,
  folderName,
  childTableName,
}: {
  accountId: string;
  slug: string;
  folderPrefix: string;
  folderName: string;
  childTableName: string;
}) => {
  const readParams: DynamoDB.DocumentClient.QueryInput = {
    TableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    FilterExpression: "#name = :name",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
      "#name": "name",
    },
    ExpressionAttributeValues: {
      ":id": `${accountId}:${FOLDERS}`,
      ":slug": folderPrefix,
      ":name": folderName,
    },
  };

  const { Items: folders = [] } = await dynamoDb.query(readParams).promise();

  if (folders.length) {
    const childs: Array<object> = folders[0].childs;

    childs.push({
      id: `${accountId}:${childTableName}`,
      slug: slug,
    });

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        tableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
        keys: {
          id: `${accountId}:${FOLDERS}`,
          slug: folders[0].slug!,
        },
        item: {
          childs: childs,
        },
      });

    await dynamoDb.update(params).promise();
  } else {
    const folderParams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
      Item: {
        id: `${accountId}:${FOLDERS}`,
        slug: `${folderPrefix}:${uuid.v4()}`,
        name: folderName,
        sort_order: 0,
        childs: [
          {
            id: `${accountId}:${childTableName}`,
            slug: slug,
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: null,
        is_deleted: 0,
      },
    };

    await dynamoDb.put(folderParams).promise();
  }
};

export default putInFolder;
