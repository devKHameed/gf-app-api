/* eslint no-eval: 0 */

import DynamoDB from "aws-sdk/clients/dynamodb";
import _ from "lodash";
import { FusionOperatorLog } from "types/Fusion";
import { GFMLFunction, ThreePApp, ThreePAppModule } from "types/Fusion/3pApp";
import { envTableNames } from "../../config";
import { generateLog } from "../../util/3pModule";
import { executeModules } from "../3pModule";

const dynamodb = new DynamoDB.DocumentClient();

export const callRpc = async (
  appSlug: string,
  rpc: string,
  app: ThreePApp,
  bodyData: Record<string, unknown>,
  gfmlFunctions: GFMLFunction[] = [],
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  pushToLogs: (log: FusionOperatorLog) => void = () => {},
  accountId: string,
  isGlobal?: boolean
) => {
  console.log("make_rpc_call: ", { app, rpc, appSlug, bodyData });
  const moduleName = rpc.replace("rpc://", "");

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
        ":slug": `${appSlug}:`,
        ":module_name": moduleName,
      },
    })
    .promise();
  console.log("RPC Items: ", Items);

  const rpcModule = Items[0] as ThreePAppModule;
  if (!rpcModule) {
    pushToLogs?.(generateLog("No RPC found", "Failed", { app: appSlug }));
    throw new Error("RPC not found!");
  }

  console.log("execute modules for rpc");
  const responses = await executeModules({
    module: rpcModule,
    app,
    bodyData: _.cloneDeep(bodyData),
    appSlug,
    gfmlFunctions,
    pushToLogs,
    accountId,
    isGlobal,
  });
  // console.log("RPC Item responses: ", responses);
  return responses;
};
