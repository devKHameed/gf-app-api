import { ElasticTranscoder } from "aws-sdk";
import STS from "aws-sdk/clients/sts";
import {
  REGION,
  YTCOMB_ACCT_ACCESS_ROLE_ARN,
  YTCOMB_ACCT_ACCESS_ROLE_SESSION_NAME,
} from "../../config";

let transcoderClient: ElasticTranscoder;

const getRoleCredentialsCredentials = async () => {
  if (!YTCOMB_ACCT_ACCESS_ROLE_ARN || !YTCOMB_ACCT_ACCESS_ROLE_SESSION_NAME) {
    throw new Error(
      "MAIN_ACCT_ACCESS_ROLE_ARN and MAIN_ACCT_ACCESS_ROLE_SESSION_NAME must be specified"
    );
  }

  const stsClient = new STS();
  const stsSession = await stsClient
    .assumeRole({
      RoleArn: YTCOMB_ACCT_ACCESS_ROLE_ARN,
      RoleSessionName: YTCOMB_ACCT_ACCESS_ROLE_SESSION_NAME,
    })
    .promise();

  if (!stsSession.Credentials) {
    throw new Error(`Could not assume role ${YTCOMB_ACCT_ACCESS_ROLE_ARN}`);
  }

  return stsSession.Credentials;
};

export const getTranscoderClient = async () => {
  if (transcoderClient) {
    return transcoderClient;
  }

  const { AccessKeyId, SecretAccessKey, SessionToken } =
    await getRoleCredentialsCredentials();
  const transcoder = new ElasticTranscoder({
    accessKeyId: AccessKeyId,
    secretAccessKey: SecretAccessKey,
    sessionToken: SessionToken,
    region: REGION,
  });

  transcoderClient = transcoder;
  return transcoderClient;
};
