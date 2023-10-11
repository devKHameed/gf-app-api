import { DocumentClient } from "aws-sdk/lib/dynamodb/document_client";

export default function ({
  keys,
  tableName,
  item,
  ...rest
}: {
  keys: { [key: string]: string };
  tableName: string;
  item: { [key: string]: any };
} & Omit<
  DocumentClient.UpdateItemInput,
  | "TableName"
  | "Key"
  | "UpdateExpression"
  | "ExpressionAttributeNames"
  | "ExpressionAttributeValues"
>) {
  const Item: Record<string, any> = {
    ...item,
    updated_at: new Date().toISOString(),
  };
  let updateExpression = "SET";
  let conditionExpression = "";
  const ExpressionAttributeNames: Record<string, string> = {};
  const ExpressionAttributeValues: Record<string, any> = {};

  for (const property in Item) {
    if (Item[property] != null) {
      //ignore null and undefined fields
      updateExpression += ` #${property} = :${property} ,`;
      ExpressionAttributeNames["#" + property] = property;
      ExpressionAttributeValues[":" + property] = Item[property];
    }
  }

  for (const key in keys) {
    if (keys[key] != null) {
      //ignore null and undefined fields
      ExpressionAttributeNames["#" + key] = key;
      ExpressionAttributeValues[":" + key] = keys[key];
      if (conditionExpression.length > 1) conditionExpression += " AND ";
      conditionExpression += `#${key} = :${key}`;
    }
  }

  updateExpression = updateExpression.slice(0, -1);

  const params: DocumentClient.UpdateItemInput = {
    TableName: tableName,
    Key: keys,
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: ExpressionAttributeNames,
    ExpressionAttributeValues: ExpressionAttributeValues,
    ...rest,
  };

  if (conditionExpression) {
    params.ConditionExpression = conditionExpression;
  }

  return params;
}
