import type { AWS } from "@serverless/typescript";
import "dotenv/config";
import functions from "./resources/functions";
import central from "./resources/functions/central";
import {
  ACCT_NAME,
  APP_NAME,
  DATABASE_SECRET_ARN,
  DEPLOYMENT_BUCKET_WITH_REGION,
  MAIN_POOL,
  MEDIA_BUCKET,
  MEDIA_BUCKET_CDN_URL,
  OPEN_AI_API_KEY,
  RDS_URL,
  RESOURCES_STACK_PRFIX,
  SERVICE_ENDPOINT_WEBSOCKET,
  STRIPE_SECRET_KEY,
} from "./resources/functions/common";
import fusion from "./resources/functions/fusion";

let filterFunction = functions[ACCT_NAME];
let ServiceName: string = APP_NAME;
let serviceSpecificResources = fusion;

const isMainAccount = ACCT_NAME === "main";
if (isMainAccount) {
  filterFunction = (filterFunction as any)[MAIN_POOL];
  ServiceName = `${APP_NAME}-${MAIN_POOL}`;
  serviceSpecificResources = central;
}

const enabledStackSpliting = !(
  (isMainAccount && MAIN_POOL === "websocket") ||
  ACCT_NAME === "fusion"
);

const serverlessConfiguration: AWS = {
  app: ServiceName,
  service: ServiceName,
  frameworkVersion: "3",
  package: {
    individually: true,
    include: ["mysql2"],
  },
  custom: {
    splitStacks: enabledStackSpliting && {
      nestedStackCount: 20, // Controls the number of created nested stacks
      perFunction: false,
      perType: false,
      perGroupFunction: true,
      custom: "./plugins/splitter.js",
    },
    prune: {
      automatic: true,
      number: 1,
    },
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      exclude: ["aws-sdk"],
      target: "node14",
      define: { "require.resolve": undefined },
      platform: "node",
      concurrency: 10,
      packager: "yarn",
      external: ["knex"],
    },
    "serverless-offline": {
      useChildProcesses: true,
      allowCache: true,
      noAuth: true,
    },
    autoswagger: {
      generateSwaggerOnDeploy: true,
      typefiles: ["./src/types/index.ts"],
    },
    deploymentBucket: {
      enabled: !!DEPLOYMENT_BUCKET_WITH_REGION,
    },
    MediaBucketName: MEDIA_BUCKET,
    ...serviceSpecificResources.custom,
  },
  provider: {
    name: "aws",
    runtime: "nodejs16.x",
    // region: "us-east-1",
    stage: "${sls:stage}",
    environment: {
      REGION: "${aws:region}",
      STAGE: "${sls:stage}",
      STRIPE_SECRET_KEY: STRIPE_SECRET_KEY!,
      WEBSOCKET_URL: SERVICE_ENDPOINT_WEBSOCKET!,
      S3_URL: MEDIA_BUCKET_CDN_URL, // either env or stack
      OPEN_AI_API_KEY: OPEN_AI_API_KEY!,
      MEDIA_BUCKET_NAME: MEDIA_BUCKET!,
      DB_ENDPOINT: RDS_URL!,
      DATABASE_SECRET_ARN: DATABASE_SECRET_ARN!,
      RESOURCES_STACK_PRFIX,
      ACCT_NAME,
      APP_NAME,
      ...serviceSpecificResources.env,
    },
    iam: {
      role: {
        statements: [
          {
            Effect: "Allow",
            Action: ["dynamodb:*"],
            Resource: ["arn:aws:dynamodb:${aws:region}:*:table/*"],
          },
          {
            Effect: "Allow",
            Action: ["lambda:*"],
            Resource: ["*"],
          },
          {
            Effect: "Allow",
            Action: ["execute-api:*"],
            Resource: ["*"],
          },
          {
            Effect: "Allow",
            Action: ["s3:*"],
            Resource: ["*"],
          },
          ...serviceSpecificResources.iamRoleStatements,
        ],
      },
    },
    httpApi: serviceSpecificResources.httpApi,
    deploymentBucket: DEPLOYMENT_BUCKET_WITH_REGION,
  },
  resources: serviceSpecificResources.resources,
  functions: filterFunction as any,
  plugins: [
    "serverless-offline",
    "serverless-esbuild",
    "serverless-prune-plugin",
    "serverless-plugin-split-stacks",
    "serverless-iam-roles-per-function",
    "serverless-analyze-bundle-plugin",
    "serverless-deployment-bucket",
    "./plugins/RemoveOutputs.js",
    "./plugins/StoreOutputInSSM.js",
  ],
};

module.exports = serverlessConfiguration;
