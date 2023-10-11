import { RequsetCreateAccountUserBody } from "../../../src/functions/user/createAccountUser";
import { RequsetUpdateAccountUserBody } from "../../../src/functions/user/updateAccountUserBySlug";
import { RequsetUpdateUserBody } from "../../../src/functions/user/updateUser";

const functions = {
  createAccountUser: {
    handler: "src/functions/user/createAccountUser.handler",
    events: [
      {
        httpApi: {
          path: "/account-user",
          method: "post",
          bodyType: RequsetCreateAccountUserBody,
          swaggerTags: ["Users"],
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
  },
  listAccountUsers: {
    handler: "src/functions/user/listAccountUsers.handler",
    events: [
      {
        httpApi: {
          path: "/account-user",
          method: "get",
          swaggerTags: ["Users"],
          authorizer: "serviceAuthorizer",
        },
      },
    ],
  },
  getAccountUserBySlug: {
    handler: "src/functions/user/getAccountUserBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/account-user/{slug}",
          method: "get",
          swaggerTags: ["Users"],
          authorizer: "serviceAuthorizer",
        },
      },
    ],
  },
  updateAccountUserBySlug: {
    handler: "src/functions/user/updateAccountUserBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/account-user/{slug}",
          method: "put",
          swaggerTags: ["Users"],
          bodyType: RequsetUpdateAccountUserBody,
          authorizer: "serviceAuthorizer",
        },
      },
    ],
  },
  getUser: {
    handler: "src/functions/user/getUser.handler",
    events: [
      {
        httpApi: {
          path: "/user",
          method: "get",
          swaggerTags: ["Users"],
          authorizer: "serviceAuthorizer",
        },
      },
    ],
  },
  updateUser: {
    handler: "src/functions/user/updateUser.handler",
    events: [
      {
        httpApi: {
          path: "/user",
          method: "put",
          swaggerTags: ["Users"],
          bodyType: RequsetUpdateUserBody,
          authorizer: "serviceAuthorizer",
        },
      },
    ],
  },
};
export default functions;
