import { TranscribeService } from "aws-sdk";
import STS from "aws-sdk/clients/sts";
import {
  MAIN_ACCT_ACCESS_ROLE_ARN,
  MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
  REGION,
} from "../../config";

let transcriberClient: TranscribeService;

const getRoleCredentialsCredentials = async () => {
  if (!MAIN_ACCT_ACCESS_ROLE_ARN || !MAIN_ACCT_ACCESS_ROLE_SESSION_NAME) {
    throw new Error(
      "MAIN_ACCT_ACCESS_ROLE_ARN and MAIN_ACCT_ACCESS_ROLE_SESSION_NAME must be specified"
    );
  }

  const stsClient = new STS();
  const stsSession = await stsClient
    .assumeRole({
      RoleArn: MAIN_ACCT_ACCESS_ROLE_ARN,
      RoleSessionName: MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
    })
    .promise();
  console.log(
    "🚀 ~ file: index.ts:25 ~ getRoleCredentialsCredentials ~ stsSession:",
    stsSession
  );

  if (!stsSession.Credentials) {
    throw new Error(`Could not assume role ${MAIN_ACCT_ACCESS_ROLE_ARN}`);
  }

  return stsSession.Credentials;
};

export const getTranscriberClient = async () => {
  if (transcriberClient) {
    return transcriberClient;
  }

  const { AccessKeyId, SecretAccessKey, SessionToken } =
    await getRoleCredentialsCredentials();
  console.log(
    "🚀 ~ file: index.ts:39 ~ getTranscriberClient ~ AccessKeyId, SecretAccessKey, SessionToken:",
    AccessKeyId,
    SecretAccessKey,
    SessionToken
  );
  const service = new TranscribeService({
    accessKeyId: AccessKeyId,
    secretAccessKey: SecretAccessKey,
    sessionToken: SessionToken,
    region: REGION,
  });

  transcriberClient = service;
  return Promise.resolve(transcriberClient);
};
