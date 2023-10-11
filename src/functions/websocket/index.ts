/* eslint-disable indent */
import { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import ApiGatewayManagementApi from "aws-sdk/clients/apigatewaymanagementapi";
import DynamoDB from "aws-sdk/clients/dynamodb";
import moment from "moment";
import { v4 } from "uuid";
import { envTableNames, SOCKET, SYSTEM_USERS } from "../../config";
import { SocketConnection } from "../../types";
import { ChatEvent } from "../../types/Chat";
import { buildUserActivityItem } from "../userActivity/createUserActivityEvent";
import processSylarAction from "./sylar";
import { emit } from "./util";
type ChatMetadata = {
  user_id?: string;
  chat_connection_id?: string;
  chat_session_id?: string;
  access_list_id?: string;
  contact_id?: string;
  account_id?: string;
  primary_operator?: string;
  event?: Partial<ChatEvent>;
};

const SECONDS_IN_AN_HOUR = 60 * 60;

const dynamodb = new DynamoDB.DocumentClient();

const connectionTable = `${envTableNames.DYNAMODB_SOCKET_CONNECTION}`;
// const userTable = `${envTableNames.DYNAMODB_SYS_USERS_TABLE}`;
const userActivityTable = `${envTableNames.DYNAMODB_ACCT_USER_ACTIVITY}`;

const processPing = async ({
  apig,
  connectionId,
  body,
}: {
  connectionId: string;
  apig: ApiGatewayManagementApi;
  body: string;
}) => {
  // const connection = (await dynamodb
  //   .get({
  //     TableName: connectionTable,
  //     Key: {
  //       id: SOCKET,
  //       slug: connectionId,
  //     },
  //   })
  //   .promise()
  //   .then((res) => res.Item)) as SocketConnection;
  // await dynamodb
  //   .delete({
  //     TableName: connectionTable,
  //     Key: {
  //       id: SOCKET,
  //       slug: connectionId,
  //     },
  //   })
  //   .promise();
  // await dynamodb
  //   .put({
  //     TableName: connectionTable,
  //     Item: {
  //       ...connection,
  //       user_id: connection.user_id,
  //       last_ping: Date.now(),
  //     },
  //   })
  //   .promise();

  await apig
    .postToConnection({
      ConnectionId: connectionId,
      Data: "pong",
    })
    .promise();
};

const handleLoginProcess = async ({
  connectionId,
  body,
}: {
  connectionId: string;
  // apig: ApiGatewayManagementApi;
  body: string;
}) => {
  if (!body) return;
  const data = JSON.parse(body);
  console.log("🚀 ~ file: index.ts ~ line 1024 ~ data", data);
  const metadata: ChatMetadata = data.metadata;

  if (metadata?.user_id) {
    const userTableParams = {
      TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
      UpdateExpression: "SET is_online=:is_online",
      ExpressionAttributeValues: {
        ":is_online": true,
      },
      Key: {
        id: SYSTEM_USERS,
        slug: metadata.user_id,
      },
    };
    await dynamodb.update(userTableParams).promise();
    await dynamodb
      .put({
        TableName: userActivityTable,
        Item: buildUserActivityItem(`${metadata.user_id}`, "user_connected"),
      })
      .promise();
  }

  if (metadata?.user_id || metadata?.contact_id) {
    const connection = (await dynamodb
      .get({
        TableName: connectionTable,
        Key: {
          id: SOCKET,
          slug: connectionId,
        },
      })
      .promise()
      .then((res) => res.Item)) as SocketConnection;

    if (!connection) {
      console.log("connection not found");
      return;
    }
    await dynamodb
      .delete({
        TableName: connectionTable,
        Key: {
          id: SOCKET,
          slug: connectionId,
        },
      })
      .promise();
    await dynamodb
      .put({
        TableName: connectionTable,
        Item: {
          ...connection,
          metadata,
          user_id:
            metadata.user_id || metadata.contact_id || connection.user_id,
          is_operator: !!metadata.user_id,
          last_ping: Date.now(),
        },
      })
      .promise();
  }
};

const processDisconnect = async ({
  connectionId,
}: {
  connectionId: string;
}) => {
  // const { Item: socketItem } = await dynamodb
  //   .get({
  //     TableName: connectionTable,
  //     Key: {
  //       id: SOCKET,
  //       slug: connectionId,
  //     },
  //   })
  //   .promise();
  // console.log(socketItem);
  // if (!socketItem) {
  //   console.log("Disconnect Item Not Found!");
  //   return;
  // }

  await dynamodb
    .delete({
      TableName: connectionTable,
      Key: {
        id: SOCKET,
        slug: connectionId,
      },
    })
    .promise()
    .catch(console.log);
};

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  // For debug purposes onlys
  // You should not log any sensitive information in production.
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));

  const {
    body = "{}",
    requestContext: { connectionId, routeKey, domainName, stage },
  } = event;
  const gatewayEndpoint = `https://${domainName}/${stage}`;
  const apig = new ApiGatewayManagementApi({
    endpoint: gatewayEndpoint,
  });

  try {
    switch (routeKey) {
      case "$connect": {
        const secondsSinceEpoch = Math.round(Date.now() / 1000);
        const expirationTime = secondsSinceEpoch + 2 * SECONDS_IN_AN_HOUR;
        await dynamodb
          .put({
            TableName: connectionTable,
            Item: {
              id: SOCKET,
              slug: connectionId,
              last_ping: Date.now(),
              user_id: `dummy_${v4()}`,
              ttl: expirationTime,
              is_active: 1,
              created_at: moment.utc().format(),
            },
          })
          .promise();
        break;
      }
      case "$disconnect":
        await processDisconnect({ connectionId });
        break;
      case "login":
        await handleLoginProcess({ connectionId, body: body });
        break;
      case "ping":
        await processPing({ apig, connectionId, body: body });
        break;
      case "sylar":
        await processSylarAction(body, `${connectionId}`, gatewayEndpoint);
        break;
      case "$default":
      default:
        if (!body) {
          break;
        }
        await apig
          .postToConnection({
            ConnectionId: connectionId,
            Data: body,
          })
          .promise();
    }
  } catch (e) {
    const error = e as Error;
    console.log(
      "🚀 ~ file: index.ts ~ line 698 ~ consthandler:APIGatewayProxyWebsocketHandlerV2= ~ error",
      error
    );
    await emit(
      "error",
      {
        message: error.message,
        stack: error.stack,
        event: JSON.parse(body),
      },
      gatewayEndpoint,
      [event.requestContext.connectionId]
    );
  }

  // Return a 200 status to tell API Gateway the message was processed
  // successfully.
  // Otherwise, API Gateway will return a 500 to the client.
  return {
    statusCode: 200,
  };
};
