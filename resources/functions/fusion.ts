import { Config } from "./central";
import { CENTRAL_ACCT_ROLE, YT_COMB_ACCT_ACCESS_ROLE } from "./common";

const config: Config = {
  env: {
    MAIN_ACCT_ACCESS_ROLE_ARN: CENTRAL_ACCT_ROLE!, // get directly from .env
    MAIN_ACCT_ACCESS_ROLE_SESSION_NAME: "external-account-role-session",
    YTCOMB_ACCT_ACCESS_ROLE_ARN: YT_COMB_ACCT_ACCESS_ROLE!,
    YTCOMB_ACCT_ACCESS_ROLE_SESSION_NAME: "ytcomb-account-role-session",
  },
  iamRoleStatements: [
    {
      Effect: "Allow",
      Action: "sts:AssumeRole",
      Resource: [CENTRAL_ACCT_ROLE!, YT_COMB_ACCT_ACCESS_ROLE!],
    },
    {
      Sid: "RDSAccess",
      Effect: "Allow",
      Action: ["rds:*"],
      Resource: CENTRAL_ACCT_ROLE!,
    },
    {
      Sid: "SecretsManagerAccess",
      Effect: "Allow",
      Action: ["secretsmanager:*"],
      Resource: CENTRAL_ACCT_ROLE!,
    },
    {
      Sid: "EC2Access",
      Effect: "Allow",
      Action: ["ec2:*"],
      Resource: CENTRAL_ACCT_ROLE!,
    },
    {
      Sid: "ElasticTranscoder",
      Effect: "Allow",
      Action: ["elastictranscoder:*"],
      Resource: "*",
    },
    {
      Sid: "TranscribeAccess",
      Effect: "Allow",
      Action: ["transcribe:*"],
      Resource: CENTRAL_ACCT_ROLE!,
    },
  ],
  custom: {},
  resources: {},
  httpApi: {},
};

export default config;
