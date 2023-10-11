import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import _ from "lodash";
import { SocketConnection, ThreePAppRemoteProcedure } from "types";
import { SOCKET, WEBSOCKET_URL, envTableNames } from "../../config";
import { AuthTypes } from "../../constants/3pApp";
import { emit } from "../../functions/websocket/util";
import { ParseOptions, getFunctions } from "../../helpers/3pExpression";
import { callRpc } from "../../helpers/rpc";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import {
  checkIfExpired,
  get3pApp,
  getAppConnection,
  getFusionConnection,
  updateAccessToken,
} from "../../util/3pModule";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const dynamodb = new DynamoDB.DocumentClient();

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    console.log("executeRPC: ", JSON.stringify(event, null, 2));
    const isGlobal = event.queryStringParameters?.["is_global"] === "true";
    const accountId = event.headers["account-id"];
    const {
      appSlug: app,
      rpc: rpcName,
      parameters,
      connectionSlug,
      userSlug: userId,
    } = event.body;
    const options: ParseOptions = { body: { parameters }, app: app as string };

    // console.log("Getting 3PApp: ");
    const appItem = await get3pApp(
      app as string,
      `${isGlobal ? "global" : accountId}`
    );
    console.log("3PApp: ", appItem);

    if (!appItem) {
      throw createHttpError(400, "App Doesn't Exist!");
    }

    const connectionItem = connectionSlug
      ? await getFusionConnection(connectionSlug as string, accountId as string)
      : undefined;
    console.log("Connection: ", connectionItem);
    const connection = connectionItem?.meta_data;
    if (connectionItem) {
      // throw createHttpError(400, "Fusion Connection Doesn't Exist!");
      _.set(options, "body.connection", connection);
      _.set(options, "body.data", connection);
    }

    console.log("Options after connection and data application: ", options);

    const moduleName = (rpcName as string).replace("rpc://", "");

    //Get RPC
    const { Items = [] } = await dynamodb
      .query({
        TableName: `${envTableNames.DYNAMODB_ACCT_3P_APP_RPS}`,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression:
          "#is_deleted = :is_deleted AND #module_name = :module_name",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
          "#module_name": "module_name",
        },
        ExpressionAttributeValues: {
          ":id": `3p:${isGlobal ? "global" : accountId}:3p_app_rp`,
          ":is_deleted": false,
          ":slug": `${app}:`,
          ":module_name": moduleName,
        },
      })
      .promise();
    console.log("RPC Items: ", Items);

    const rpc = Items[0] as ThreePAppRemoteProcedure | undefined;

    if (!rpc) {
      throw createHttpError(404, new Error("RPC not found!"));
    }

    //Get App Connection
    const appConnectionSlug = rpc.connection_id || rpc.alt_connection_id;
    console.log("Getting App Connection");
    const appConnection = appConnectionSlug
      ? await getAppConnection(
        appConnectionSlug,
        `${isGlobal ? "global" : accountId}`
      )
      : undefined;
    console.log("App Connection: ", appConnection);

    if (appConnection && connection) {
      // throw createHttpError(400, "App Connection Doesn't Exist!");
      _.set(options, "body.common", appConnection.common_data);
      const updateToken = checkIfExpired(connection); //Update Needed
      const oauthType = appConnection.type;
      if (oauthType === AuthTypes.O2ACRF && updateToken) {
        const refreshData = appConnection.communication.refresh;
        //Update Refresh token
        console.log("Updating Refresh Token");
        console.log({ app, accountId });
        const gfmlFunctions = await getFunctions(
          app as string,
          `${isGlobal ? "3p:global" : accountId}`
        );
        const newConnection = await updateAccessToken(
          refreshData as Record<string, unknown>,
          options.body as Record<string, unknown>,
          app as string,
          connectionItem,
          gfmlFunctions
        );
        console.log("New Connection: ", newConnection);
        if (!newConnection) {
          throw createHttpError(
            404,
            new Error("Failed To Generate Access Token!")
          );
        }
        _.set(options, "body.connection", newConnection);
        console.log("Options after connection application: ", options);
      }
    }

    // console.log(" update_token: ", updateToken);

    console.log("Making RPC Call");
    const responses = await callRpc(
      app as string,
      rpcName as string,
      appItem,
      options.body!,
      undefined,
      undefined,
      `${accountId}`,
      isGlobal
    );
    const socketConnections = await dynamodb
      .query({
        TableName: envTableNames.DYNAMODB_SOCKET_CONNECTION,
        IndexName: "user_id_lsi_index",
        KeyConditionExpression: "#id = :id AND #userId = :userId",
        ExpressionAttributeNames: {
          "#id": "id",
          "#userId": "user_id",
        },
        ExpressionAttributeValues: {
          ":id": SOCKET,
          ":userId": userId,
        },
      })
      .promise()
      .then(
        (data) => (data.Items as SocketConnection[])?.map((s) => s.slug) || []
      );
    await emit(
      "response",
      {
        data: _.last(responses),
        rpc: rpcName,
      },
      WEBSOCKET_URL,
      socketConnections,
      "rpc"
    );
    console.log("Responses: ", responses);
    return {
      statusCode: 200,
      body: {
        data: _.last(responses),
        message: "RPC Request Success",
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  // .use(validator({ eventSchema })) // validates the input
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(
    httpResponseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }: any) => JSON.stringify(body),
        },
      ],
      defaultContentType: "application/json",
    })
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
