import type { AWS } from "@serverless/typescript";
import {
  FUSION_ACCT_ROLES,
  MAIN_POOL,
  PUBLIC_COGNITO_CLIENT_ID,
  PUBLIC_COGNITO_USER_POOL,
} from "./common";

export type Config = {
  env: { [key: string]: string | any };
  iamRoleStatements: {
    Effect: string | string[];
    Action: string | string[];
    Resource: string | string[];
    [key: string]: any;
  }[];
  resources: AWS["resources"];
  httpApi: AWS["provider"]["httpApi"];
  custom: { [key: string]: string };
};
const isWebSocket = MAIN_POOL === "websocket";
const config: Config = {
  env: {
    FUSION_ACCT_LAMBDA_ACCESS_ROLE_ARN: FUSION_ACCT_ROLES,
    FUSION_ACCT_LAMBDA_ACCESS_ROLE_SESSION_NAME:
      "central-external-account-role-session",
    PUBLIC_COGNITO_USER_POOL: PUBLIC_COGNITO_USER_POOL!,
    PUBLIC_COGNITO_CLIENT_ID: PUBLIC_COGNITO_CLIENT_ID!,
    HTTP_API_URL: isWebSocket
      ? { "Fn::GetAtt": ["WebsocketsApi", "ApiEndpoint"] }
      : { "Fn::GetAtt": ["HttpApi", "ApiEndpoint"] },
  },
  iamRoleStatements: [
    {
      Effect: "Allow",
      Action: "sts:AssumeRole",
      Resource: ["*"],
    },
    {
      Effect: "Allow",
      Action: "ssm:GetParameter",
      Resource: "*",
    },
  ],
  resources: {
    Resources: {
      RdsAndDynamoAccessRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  Service: "lambda.amazonaws.com",
                },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "DynamoAndRDS",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Sid: "RDSAccess",
                    Effect: "Allow",
                    Action: ["rds:*"],
                    Resource: "*",
                  },
                  {
                    Sid: "SecretsManagerAccess",
                    Effect: "Allow",
                    Action: ["secretsmanager:*"],
                    Resource: "*",
                  },
                  {
                    Sid: "EC2Access",
                    Effect: "Allow",
                    Action: [
                      "ec2:CreateNetworkInterface",
                      "ec2:DescribeNetworkInterfaces",
                      "ec2:DeleteNetworkInterface",
                    ],
                    Resource: "*",
                  },
                  {
                    Sid: "DynamoDBAccess",
                    Effect: "Allow",
                    Action: ["dynamodb:*"],
                    Resource: "arn:aws:dynamodb:${aws:region}:*:table/*",
                  },
                  {
                    Effect: "Allow",
                    Action: [
                      "logs:CreateLogGroup",
                      "logs:CreateLogStream",
                      "logs:PutLogEvents",
                    ],
                    Resource: "arn:aws:logs:*:*:*",
                  },
                  {
                    Effect: "Allow",
                    Action: "sts:AssumeRole",
                    Resource: ["*"],
                  },
                  {
                    Effect: "Allow",
                    Action: "ssm:GetParameter",
                    Resource: "*",
                  },
                ],
              },
            },
          ],
        },
      },
    },
  },
  httpApi: {
    authorizers: {
      serviceAuthorizer: {
        scopes: "aws.cognito.signin.user.admin",
        identitySource: "$request.header.Authorization",
        issuerUrl: `https://cognito-idp.${"${aws:region}"}.amazonaws.com/${PUBLIC_COGNITO_USER_POOL}`,
        audience: PUBLIC_COGNITO_CLIENT_ID!,
      },
    },
    cors: {
      allowedOrigins: ["*"],
      allowedMethods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
      allowedHeaders: [
        "Content-Type",
        "X-Amz-Date",
        "Authorization",
        "X-Api-Key",
        "X-Amz-Security-Token",
        "X-Amz-User-Agent",
        "X-Transaction-Key",
        "Access-Control-Allow-Origin",
        "Account-Id",
      ],
    },
  },
  custom: {},
};

export default config;
