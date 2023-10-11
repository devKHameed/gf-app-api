/* eslint-disable indent */
import { STS } from "aws-sdk";
import ApiGatewayManagementApi from "aws-sdk/clients/apigatewaymanagementapi";
import {
  ACCT_NAME,
  MAIN_ACCT_ACCESS_ROLE_ARN,
  MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
} from "../../config";

const stsClient = new STS();

const getApiGatewayClient = async (domainName: string) => {
  let gateway = new ApiGatewayManagementApi({
    endpoint: domainName,
  });
  if (ACCT_NAME !== "main") {
    if (!MAIN_ACCT_ACCESS_ROLE_ARN || !MAIN_ACCT_ACCESS_ROLE_SESSION_NAME) {
      throw new Error(
        "MAIN_ACCT_ACCESS_ROLE_ARN and MAIN_ACCT_ACCESS_ROLE_SESSION_NAME must be specified"
      );
    }

    const stsSession = await stsClient
      .assumeRole({
        RoleArn: MAIN_ACCT_ACCESS_ROLE_ARN,
        RoleSessionName: MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
      })
      .promise();

    if (!stsSession.Credentials) {
      throw new Error(`Could not assume role ${MAIN_ACCT_ACCESS_ROLE_ARN}`);
    }

    const { AccessKeyId, SecretAccessKey, SessionToken } =
      stsSession.Credentials;
    gateway = new ApiGatewayManagementApi({
      endpoint: domainName,
      credentials: {
        accessKeyId: AccessKeyId,
        secretAccessKey: SecretAccessKey,
        sessionToken: SessionToken,
      },
    });
    // console.log("Connected to main account database");
  }

  return gateway;
};

export const emit = async (
  type: string,
  data: Record<string, unknown>,
  domainName: string,
  connectionIds: string[] = [],
  action?: string
) => {
  console.log("🚀 ~ file: index.ts ~ line 724 ~ domainName", {
    domainName,
    connectionIds,
    data,
  });

  const gateway = await getApiGatewayClient(domainName);

  await Promise.all(
    [...new Set(connectionIds)].map(async (connectionId) => {
      await gateway
        .postToConnection({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            action,
            type,
            data: data,
          }),
        })
        .promise()
        .catch((e) => {
          console.log("🚀 ~ file: websocket.js ~ line 366 ~ .promise ~ e", e);
        });
    })
  );
};
