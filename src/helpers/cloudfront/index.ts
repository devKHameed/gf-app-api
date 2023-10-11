import { CloudFront } from "aws-sdk";
import STS from "aws-sdk/clients/sts";
import {
  ACCT_NAME,
  MAIN_ACCT_ACCESS_ROLE_ARN,
  MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
  REGION,
} from "../../config";

const stsClient = new STS();

const getCloudfrontCredentials = async () => {
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

  return stsSession.Credentials;
};

export const getCloudfrontClient = async () => {
  let cloudfront = new CloudFront();
  if (ACCT_NAME !== "main") {
    const { AccessKeyId, SecretAccessKey, SessionToken } =
      await getCloudfrontCredentials();
    cloudfront = new CloudFront({
      accessKeyId: AccessKeyId,
      secretAccessKey: SecretAccessKey,
      sessionToken: SessionToken,
      region: REGION,
    });
  }
  return cloudfront;
};
