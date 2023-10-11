import Lambda from "aws-sdk/clients/lambda";
import STS from "aws-sdk/clients/sts";
import {
  ACCT_NAME,
  FUSION_ACCT_LAMBDA_ACCESS_ROLE_ARNS,
  FUSION_ACCT_LAMBDA_ACCESS_ROLE_SESSION_NAME,
  REGION,
} from "../../config";
import { InvocationType } from "../../enums/lambda";

const PoolLength = FUSION_ACCT_LAMBDA_ACCESS_ROLE_ARNS?.length - 1;
const stsClient = new STS();
let lambdaClient: Lambda;

type ExtraOptions = { roundRobin?: boolean; fusionAccountIndex?: number };
export const getFusionLambdaCredentials = async (
  fusionAccountIndex?: number
) => {
  if (
    !FUSION_ACCT_LAMBDA_ACCESS_ROLE_ARNS ||
    !FUSION_ACCT_LAMBDA_ACCESS_ROLE_SESSION_NAME
  ) {
    throw new Error(
      "FUSION_ACCT_LAMBDA_ACCESS_ROLE_ARNS and FUSION_ACCT_LAMBDA_ACCESS_ROLE_SESSION_NAME must be specified"
    );
  }

  const selectedAccount =
    FUSION_ACCT_LAMBDA_ACCESS_ROLE_ARNS[
      fusionAccountIndex ?? Math.floor(Math.random() * PoolLength)
    ];
  console.log("🚀 ~ file: index.ts:29 ~ selectedAccount:", selectedAccount);

  console.log("selectedAccount", selectedAccount);
  const stsSession = await stsClient
    .assumeRole({
      RoleArn: selectedAccount,
      RoleSessionName: FUSION_ACCT_LAMBDA_ACCESS_ROLE_SESSION_NAME,
    })
    .promise();

  if (!stsSession.Credentials) {
    throw new Error(
      `Could not assume role ${FUSION_ACCT_LAMBDA_ACCESS_ROLE_ARNS}`
    );
  }

  return stsSession.Credentials;
};

export const initFusionLambdaClient = async (options: ExtraOptions) => {
  let lambda = new Lambda();
  if (ACCT_NAME === "main" && options.roundRobin) {
    const { AccessKeyId, SecretAccessKey, SessionToken } =
      await getFusionLambdaCredentials(options.fusionAccountIndex);
    console.log(
      "🚀 ~ file: index.ts:50 ~ initFusionLambdaClient ~ AccessKeyId, SecretAccessKey, SessionToken:",
      AccessKeyId,
      SecretAccessKey,
      SessionToken
    );
    lambda = new Lambda({
      accessKeyId: AccessKeyId,
      secretAccessKey: SecretAccessKey,
      sessionToken: SessionToken,
      region: REGION,
    });
  }

  lambdaClient = lambda;
  return lambda;
};

export const invokeLambda = async (
  functionName: string,
  payload: Record<string, unknown> = {},
  invocationType: InvocationType,
  options: ExtraOptions = { roundRobin: false }
) => {
  console.log(
    "Invoke Lambda: ",
    JSON.stringify({ functionName, payload, invocationType }, null, 2)
  );
  /*if (!lambdaClient) {
    await initFusionLambdaClient(options);
  }*/

  await initFusionLambdaClient(options);
  return await lambdaClient
    .invoke({
      FunctionName: functionName,
      InvocationType: invocationType,
      Payload: JSON.stringify(payload),
    })
    .promise();
};
