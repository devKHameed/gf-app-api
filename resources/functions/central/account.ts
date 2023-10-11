import { MYSQL2_LAYER, PRIVATE_SUBNET, RDS_ROLE } from "../common";

const functions = {
  // createAccount: {
  //   handler: "src/functions/account/createAccount.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/account",
  //         method: "post",
  //         bodyType: RequsetCreateAccountBody,
  //         responses: {
  //           200: {
  //             description: "Success",
  //             bodyType: "AccountReponse",
  //           },
  //         },
  //         // tag: ["Account"],//TODO: use this in auto swagger generator
  //       },
  //     },
  //   ],
  // },
  // getAccountBySlug: {
  //   handler: "src/functions/account/getAccountBySlug.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/account/{slug}",
  //         method: "get",
  //         responses: {
  //           200: {
  //             description: "Success",
  //             bodyType: "AccountReponse",
  //           },
  //         },
  //       },
  //     },
  //   ],
  // },
  // updateAccountBySlug: {
  //   handler: "src/functions/account/updateAccountBySlug.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/account/{slug}",
  //         method: "put",
  //         bodyType: RequsetUpdateAccountBody,
  //         responses: {
  //           200: {
  //             description: "Success",
  //             bodyType: "AccountReponse",
  //           },
  //         },
  //         authorizer: "serviceAuthorizer",
  //       },
  //     },
  //   ],
  // },
  // removeAccountBySlug: {
  //   handler: "src/functions/account/removeAccountBySlug.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/account/{slug}",
  //         method: "delete",
  //       },
  //     },
  //   ],
  // },
  // listAccount: {
  //   handler: "src/functions/account/listAccount.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/account",
  //         method: "get",
  //         responses: {
  //           200: {
  //             description: "Success",
  //             bodyType: "AccountReponseList",
  //           },
  //         },
  //       },
  //     },
  //   ],
  // },
  getAccountSubscriptionsByAccountId: {
    handler: "src/functions/account/getAccountSubscriptionsByAccountId.handler",
    events: [
      {
        httpApi: {
          path: "/account-subscriptions",
          method: "get",
        },
      },
    ],
  },
  changeAccountPackage: {
    handler: "src/functions/account/changeAccountPackage.handler",
    events: [
      {
        httpApi: {
          path: "/account/change-package",
          method: "put",
        },
      },
    ],
  },
  requestCredit: {
    handler: "src/functions/account/requestCredit.handler",
    events: [
      {
        httpApi: {
          path: "/account/request-credit",
          method: "put",
        },
      },
    ],
    vpc: PRIVATE_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  requestCreditConfirmation: {
    handler: "src/functions/account/requestCreditConfirmation.handler",
    events: [
      {
        httpApi: {
          path: "/account/request-credit-confirm",
          method: "put",
        },
      },
    ],
    vpc: PRIVATE_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
};

export default functions;
