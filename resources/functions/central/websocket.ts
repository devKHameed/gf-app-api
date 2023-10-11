import { MYSQL2_LAYER, PRIVATE_SUBNET } from "../common";

const functions = {
  websocketLambda: {
    handler: "src/functions/websocket/index.handler",
    events: [
      {
        websocket: {
          route: "$connect",
        },
      },
      {
        websocket: {
          route: "$default",
        },
      },
      {
        websocket: {
          route: "$disconnect",
        },
      },
      {
        websocket: {
          route: "initial",
        },
      },
      {
        websocket: {
          route: "chat",
        },
      },
      {
        websocket: {
          route: "project",
        },
      },
      {
        websocket: {
          route: "ping",
        },
      },
      {
        websocket: {
          route: "sylar",
        },
      },
      {
        websocket: {
          route: "agent-ping",
        },
      },
      {
        websocket: {
          route: "login",
        },
      },
    ],
    timeout: 900,
    vpc: PRIVATE_SUBNET,
    layers: [MYSQL2_LAYER],
    iamRoleStatements: [
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
      {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Resource: ["*"],
      },
    ],
  },
};

export default functions;
