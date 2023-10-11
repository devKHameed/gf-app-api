import Ajv from "ajv";

import { MainPools } from ".";

//---------- env validation------------///

const ajv = new Ajv();
const envSchema = {
  type: "object",
  properties: {
    ACCT_NAME: { type: "string", enum: ["main", "fusion"] },
    MAIN_POOL: { type: "string" },
    APP_NAME: { type: "string" },
    FUSION_ACCT_ROLES: { type: "string" },
    RESOURCES_STACK_PRFIX: { type: "string" },
    PUBLIC_COGNITO_USER_POOL: { type: "string" },
    PUBLIC_COGNITO_CLIENT_ID: { type: "string" },
    PUBLIC_SUBNETS: { type: "string" },
    PRIVATE_SUBNETS: { type: "string" },
    VPC_SECURITY_GROUP_ID: { type: "string" },
    DEPLOYMENT_BUCKET: { type: "string" },
  },
  if: {
    properties: {
      ACCT_NAME: { const: "fusion" },
    },
  },
  then: {
    required: [
      "ACCT_NAME",
      "APP_NAME",
      "RESOURCES_STACK_PRFIX",
      "MEDIA_BUCKET",
      "MEDIA_CDN_DISTRIBUTION_DOMAIN_NAME",
      "RDS_PROXY_ENDPOINT_URL",
      "DATABASE_SECRET",
      "CENTRAL_ACCT_ROLE",
      "YT_COMB_ACCT_ACCESS_ROLE",
      "OPEN_AI_API_KEY",
      "STRIPE_SECRET_KEY",
    ],
  },
  else: {
    required: [
      "ACCT_NAME",
      "MAIN_POOL",
      "APP_NAME",
      "FUSION_ACCT_ROLES",
      "RESOURCES_STACK_PRFIX",
      "PUBLIC_COGNITO_USER_POOL",
      "PUBLIC_COGNITO_USER_POOL_CLIENT",
      "PUBLIC_SUBNETS",
      "PRIVATE_SUBNETS",
      "VPC_SECURITY_GROUP_ID",
      "MEDIA_BUCKET",
      "MEDIA_CDN_DISTRIBUTION_DOMAIN_NAME",
      "RDS_PROXY_ENDPOINT_URL",
      "DATABASE_SECRET",
      "OPEN_AI_API_KEY",
      "STRIPE_SECRET_KEY",
    ],
  },
};

const validate = ajv.compile(envSchema);

// Validate the process.env object against the schema
const valid = validate(process.env);
// console.log("-----process.env", process.env);
if (!valid) {
  console.log("errros", validate.errors);
  throw new Error("Validation errors");
} else {
  // Environment variables are valid
  console.log("Environment variables are valid");
}
////------------------------Environment --------------------------------------//

const scheme = "https://"; // You can change this to "http://" if you prefer an unsecure connection

// this will work for now but we need to change
export const RDS_ROLE = "RdsAndDynamoAccessRole";

//--------------Variable from env
type AccountType = "main" | "fusion";
export const ACCT_NAME = `${process.env.ACCT_NAME}` as AccountType;
export const MAIN_POOL = (process.env.MAIN_POOL as MainPools) || "public-1";
export const APP_NAME = process.env.APP_NAME as string;
export const FUSION_ACCT_ROLES = process.env.FUSION_ACCT_ROLES as string; //this should be comma seperate string
export const RESOURCES_STACK_PRFIX = process.env
  .RESOURCES_STACK_PRFIX as string;
export const PUBLIC_COGNITO_USER_POOL = process.env.PUBLIC_COGNITO_USER_POOL;
export const PUBLIC_COGNITO_CLIENT_ID =
  process.env.PUBLIC_COGNITO_USER_POOL_CLIENT;
export const PUBLIC_SUBNETS = process.env.PUBLIC_SUBNETS || "";
export const PRIVATE_SUBNETS = process.env.PRIVATE_SUBNETS || "";
export const VPC_SECURITY_GROUP_ID = process.env.VPC_SECURITY_GROUP_ID;
export const AWS_REGION = process.env.AWS_REGION;
export const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
export const MEDIA_CDN_DISTRIBUTION_DOMAIN_NAME =
  process.env.MEDIA_CDN_DISTRIBUTION_DOMAIN_NAME!;
export const WEBSOCKET_URL = process.env.SERVICE_ENDPOINT_WEBSOCKET!;
export const RDS_URL = process.env.RDS_PROXY_ENDPOINT_URL;
export const DATABASE_SECRET_ARN = process.env.DATABASE_SECRET;
export const CENTRAL_ACCT_ROLE = process.env.CENTRAL_ACCT_ROLE;
export const YT_COMB_ACCT_ACCESS_ROLE = process.env.YT_COMB_ACCT_ACCESS_ROLE;
export const OPEN_AI_API_KEY = process.env.OPEN_AI_API_KEY;
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const DEPLOYMENT_BUCKET = process.env.DEPLOYMENT_BUCKET;

//--------------End Variable from env
export const DEPLOYMENT_BUCKET_WITH_REGION = DEPLOYMENT_BUCKET?.concat(
  `-${AWS_REGION}`
);
export const MEDIA_BUCKET_CDN_URL = scheme + MEDIA_CDN_DISTRIBUTION_DOMAIN_NAME;

export const PUBLIC_SUBNET = {
  securityGroupIds: [VPC_SECURITY_GROUP_ID], // The specified security group
  subnetIds: PUBLIC_SUBNETS?.split(","), // The specified subnets
};
export const PRIVATE_SUBNET = {
  securityGroupIds: [VPC_SECURITY_GROUP_ID], // The specified security group
  subnetIds: PRIVATE_SUBNETS?.split(","), // The specified subnets
};
export const SERVICE_ENDPOINT_WEBSOCKET = WEBSOCKET_URL?.replace(
  "wss://",
  "https://"
);

export const MYSQL2_LAYER = `arn:aws:lambda:${AWS_REGION}:608461098632:layer:mysql2:1`;

export const MAINPOOLS = {
  USER_MNG: "user-mng",
  DEV_SETT: "dev-sett",
  GUI_FUSION: "gui-fusion",
  DATA_MNG: "data-mng",
  PUBLIC_1: "public-1",
  WEBSOCKET: "websocket",
} as const;
export const MAINPOOLS_APPNAME = {
  USER_MNG: `${APP_NAME}-${MAINPOOLS.USER_MNG}`,
  DEV_SETT: `${APP_NAME}-${MAINPOOLS.DEV_SETT}`,
  GUI_FUSION: `${APP_NAME}-${MAINPOOLS.GUI_FUSION}`,
  DATA_MNG: `${APP_NAME}-${MAINPOOLS.DATA_MNG}`,
  PUBLIC_1: `${APP_NAME}-${MAINPOOLS.PUBLIC_1}`,
  WEBSOCKET: `${APP_NAME}-${MAINPOOLS.WEBSOCKET}`,
} as const;
