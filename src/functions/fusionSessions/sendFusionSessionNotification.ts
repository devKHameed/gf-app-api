import middy from "@middy/core";
import type { EventBridgeHandler } from "aws-lambda";
import ApiGatewayManagementApi from "aws-sdk/clients/apigatewaymanagementapi";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { FusionSession } from "types";
import { envTableNames, WEBSOCKET_URL } from "../../config";

const dynamodb = new DynamoDB.DocumentClient();
const apig = new ApiGatewayManagementApi({
  endpoint: WEBSOCKET_URL,
});

export const lambdaHandler: EventBridgeHandler<
  "FusionSession",
  FusionSession & { is_import_session?: boolean },
  void
> = async (event) => {
  console.log("event", event.detail);

  const session = event.detail;
  const userId = session.session_data?.user_id;

  if (userId) {
    const { Items: socketItems = [] } = await dynamodb
      .query({
        TableName: `${envTableNames.DYNAMODB_SOCKET_CONNECTION}`,
        KeyConditionExpression: "#id = :id",
        ExpressionAttributeNames: {
          "#id": "id",
        },
        FilterExpression: "user_id = :user_id",
        ExpressionAttributeValues: {
          ":user_id": session?.session_data?.user_id,
          ":id": "socket",
        },
      })
      .promise();

    if (socketItems.length > 0) {
      // TODO: What is this?
      // itemKeys["app_sessions"] = (item_keys["app_sessions"] || []).reverse();

      const data: Record<string, unknown> = {
        slug: session.fusion_slug,
        type: session.is_chart_session ? "chart-data" : "fusion_test",
        data: session,
      };

      if (session.is_import_session) {
        data.type = "import-data";
        data.data = session.session_data.payload;
      }

      for (const item of socketItems) {
        await apig
          .postToConnection({
            ConnectionId: item?.slug || "",
            Data: JSON.stringify(data),
          })
          .promise()
          .catch((e) => {
            console.log("Error on item: ", item, e);
          });
      }
    }
  }
};
export const handler = middy().handler(lambdaHandler);
