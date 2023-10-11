import AWS from "aws-sdk";
import { envTableNames } from "../../config";

const dynamodb = new AWS.DynamoDB.DocumentClient();

export function extractStartJobId(inputString: string) {
  const regex = /start job (\w+)/i;
  const match = inputString.match(regex);
  if (match && match[1]) {
    return match[1];
  }
  return null; // Return null if no match found
}

export function extractCloseJobId(inputString: string) {
  const regex = /close job (\w+)/i;
  const match = inputString.match(regex);
  if (match && match[1]) {
    return match[1];
  }
  return null; // Return null if no match found
}

export const getUserLastMessage = async (id: string) => {
  const { Items } = await dynamodb
    .query({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
      KeyConditionExpression: "#id = :id",
      FilterExpression: "#is_agent = :is_agent",
      ExpressionAttributeNames: {
        "#id": "id",
        "#is_agent": "is_agent",
      },
      ExpressionAttributeValues: {
        ":id": id,
        ":is_agent": true,
      },
      Limit: 2,
      ScanIndexForward: false, // Sort in descending order
    })
    .promise();
  console.log("last-mesage", { Items });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return Items?.[1];
};
