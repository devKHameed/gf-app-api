import { RequsetCreateAccountBody } from "../../../src/functions/signup/createAccount";
import { MYSQL2_LAYER, PRIVATE_SUBNET } from "../common";

const functions = {
  createAccount: {
    handler: "src/functions/signup/createAccount.handler",
    events: [
      {
        httpApi: {
          path: "/account/create",
          method: "post",
          bodyType: RequsetCreateAccountBody,
          responseData: {
            200: {
              description: "Success",
              bodyType: "AccountReponse",
            },
          },
        },
      },
    ],
    iamRoleStatements: [
      {
        Effect: "Allow",
        Action: "cognito-idp:*",
        Resource: "*",
      },
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
        Effect: "Allow",
        Action: [
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:BatchWriteItem",
        ],
        Resource: ["arn:aws:dynamodb:${aws:region}:*:table/*"],
      },
    ],
    vpc: PRIVATE_SUBNET,
    layers: [MYSQL2_LAYER],
  },
  // verifyPayment: {
  //   handler: "src/functions/signup/verifyPayment.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/payment/verify",
  //         method: "post",
  //         bodyType: RequsetVerifyPaymentBody,
  //         responseData: {
  //           200: {
  //             description: "Success",
  //             bodyType: "AccountReponse",
  //           },
  //         },
  //         // tag: ["Account"],//TODO: use this in auto swagger generator
  //       },
  //     },
  //   ],
  //   iamRoleStatements: [
  //     {
  //       Effect: "Allow",
  //       Action: "cognito-idp:*",
  //       Resource: "*",
  //     },
  //     {
  //       Effect: "Allow",
  //       Action: [
  //         "dynamodb:Query",
  //         "dynamodb:Scan",
  //         "dynamodb:GetItem",
  //         "dynamodb:PutItem",
  //         "dynamodb:UpdateItem",
  //         "dynamodb:DeleteItem",
  //         "dynamodb:BatchWriteItem",
  //       ],
  //       Resource: ["arn:aws:dynamodb:${aws:region}:*:table/*"],
  //     },
  //   ],
  // },
};

export default functions;
