import { GFMLFunction } from "types/Fusion/3pApp";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";

export const getGlobalGFMLFunctions = async (accountId: string) => {
  console.log(
    "🚀 ~ file: index.ts:6 ~ getGlobalGFMLFunctions ~ accountId:",
    accountId
  );
  const res = await dynamodb.query({
    TableName: `${envTableNames.DYNAMODB_ACCT_GLOBAL_GFML_FUNCTIONS}`,
    FilterExpression: "#is_deleted = :is_deleted",
    KeyConditionExpression: "#id = :id",
    ExpressionAttributeNames: {
      "#is_deleted": "is_deleted",
      "#id": "id",
    },
    ExpressionAttributeValues: {
      ":id": `${
        accountId.startsWith("3p:") ? accountId : "3p:" + accountId
      }:global_gfml_functions`,
      ":is_deleted": false,
    },
  });

  return (res.Items || []) as GFMLFunction[];
};

export const getGFMLFunctions = async (app: string, accountId: string) => {
  console.log(
    "🚀 ~ file: index.ts:24 ~ getGFMLFunctions ~ app:",
    app,
    accountId
  );
  if (!app) {
    return [];
  }
  const res = await dynamodb.query({
    TableName: `${envTableNames.DYNAMODB_ACCT_3P_APP_GFML_FUNCTIONS}`,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    FilterExpression: "#is_deleted = :is_deleted",
    ExpressionAttributeNames: {
      "#is_deleted": "is_deleted",
      "#id": "id",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": `${
        accountId.startsWith("3p:") ? accountId : "3p:" + accountId
      }:3p_gfml_functions`,
      ":is_deleted": false,
      ":slug": `${app}:`,
    },
  });

  return (res.Items || []) as GFMLFunction[];
};
