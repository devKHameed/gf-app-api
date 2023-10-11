import { unmarshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBStreamHandler } from "aws-lambda";
import ApiGatewayManagementApi from "aws-sdk/clients/apigatewaymanagementapi";
import DynamoDB from "aws-sdk/clients/dynamodb";
import Lambda from "aws-sdk/clients/lambda";
import { FusionSession } from "types/Fusion";
import { envTableNames, WEBSOCKET_URL } from "../../config";

const lambda = new Lambda({
  region: "us-east-1", //change to your region
});

const dynamodb = new DynamoDB.DocumentClient();

export const handler: DynamoDBStreamHandler = async (event) => {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));
  if (event.Records.length < 1) {
    return;
  }
  const recordDetails = event.Records[0];
  const eventName = recordDetails.eventName;

  // const dbName = event.Records[0].eventSourceARN
  //   ?.split("table/")[1]
  //   .split("/")[0];
  // const endpoint_slug = dbName?.split("-a-");
  // const endpoint =
  //   endpoint_slug?.length === 2
  //     ? `gf-apps-ws-${endpoint_slug[1]}-systemdev.guifusionapp.com`
  //     : "";

  const keys = event.Records[0]?.dynamodb?.NewImage || {};
  const itemKeys = unmarshall(keys) as FusionSession;
  if (["INSERT", "MODIFY"].includes(`${eventName}`)) {
    const apig = new ApiGatewayManagementApi({
      endpoint: WEBSOCKET_URL,
    });

    console.log(
      "🚀 ~ file: index.js ~ line 29 ~ [,''].includes ~ item_keys",
      itemKeys
    );
    if (itemKeys.session_data?.user_id) {
      const { Items: socketItems = [] } = await dynamodb
        .query({
          TableName: `${envTableNames.DYNAMODB_SOCKET_CONNECTION}`,
          KeyConditionExpression: "#id = :id",
          ExpressionAttributeNames: {
            "#id": "id",
          },
          FilterExpression: "contains (metadata, :metadata)",
          ExpressionAttributeValues: {
            ":metadata": itemKeys?.session_data?.user_id,
            ":id": "socket",
          },
        })
        .promise();
      if (socketItems.length > 0) {
        // TODO: What is this?
        // itemKeys["app_sessions"] = (item_keys["app_sessions"] || []).reverse();
        for (const item of socketItems) {
          await apig
            .postToConnection({
              ConnectionId: item?.slug || "",
              Data: JSON.stringify({
                slug: itemKeys.fusion_slug,
                type: "fusion_test",
                data: itemKeys,
              }),
            })
            .promise()
            .catch((e) => {
              console.log("Error on item: ", item, e);
            });
        }
      }
    }
  }
};
