import DynamoDB from "aws-sdk/clients/dynamodb";
import { DocumentClient } from "aws-sdk/lib/dynamodb/document_client";
import { AccountUser } from "types";
import {
  ACCOUNT_PROJECTS_TABLE_NAME,
  envTableNames,
  SYSTEM_USERS,
} from "../config";
import { emitProjectUpdate } from "../helpers/websocket/project";
import { Project, ProjectUpdate } from "../types";
const dynamoDb = new DynamoDB.DocumentClient();

export default async function ({
  tableName,
  item,
  userEmail,
}: {
  tableName: string;
  item: ProjectUpdate;
  userEmail: string;
}) {
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
        ":email": userEmail,
      },
      ProjectionExpression:
        "id, slug, email, phone, first_name, last_name, profile_image",
    })
    .promise();

  const User = Items?.[0] as AccountUser;

  item.created_by = User;

  const params: DocumentClient.PutItemInput = {
    TableName: tableName,
    Item: item,
  };

  await dynamoDb.put(params).promise();
  const accountId: string = item.id.split(":")[0];

  const paramsGet: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_PROJECTS,
    Key: {
      id: `${accountId}:${ACCOUNT_PROJECTS_TABLE_NAME}`,
      slug: item.project_slug,
    },
  };

  const { Item } = await dynamoDb.get(paramsGet).promise();
  const project = Item as Project;
  const userIds: string[] = [];

  for (const key in project.roles) {
    const userId: string = project.roles[key].user_slug;
    if (!userIds.includes(userId)) {
      userIds.push(userId);
    }
  }

  await emitProjectUpdate(item, userIds);

  return params;
}
