import _ from "lodash";
import { SocketConnection } from "types";
import { SOCKET, envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";

export const parserShortCode = (
  text = "",
  variables: { [key: string]: string } = {}
) => {
  let finalText = text;
  const pattern = /\{{(.*?)\}}/g;

  const matches: Record<string, any> = {};
  let match;
  while ((match = pattern.exec(text)) != null) {
    matches[match[0]] = match[1];
    console.log(match);
  }

  Object.keys(matches).forEach((key) => {
    finalText = finalText.replace(
      key,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      _.get(variables, (matches as any)?.[key], "")
    );
  });
  return finalText;
};

export const getUserSocketConnection = async (userId: string) => {
  if (!userId) throw new Error("UserId is required");

  return (await dynamodb
    .query({
      TableName: `${envTableNames.DYNAMODB_SOCKET_CONNECTION}`,
      IndexName: "user_id_lsi_index",
      KeyConditionExpression: "#id = :id AND #user_id = :user_id",
      FilterExpression: "#is_active = :is_active",
      ExpressionAttributeNames: {
        "#id": "id",
        "#user_id": "user_id",
        "#is_active": "is_active",
      },
      ExpressionAttributeValues: {
        ":id": SOCKET,
        ":user_id": userId,
        ":is_active": 1,
      },
    })
    .then((res) => (res.Items || []) as SocketConnection[])
    .then((res) => res.map((s) => s.slug))
    .catch((err) => {
      console.log("Couldn't get socket connections for userId", userId);
      console.log("Error", err);
    })) as string[];
};
