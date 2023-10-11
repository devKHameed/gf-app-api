import { RequsetCreateUserTypeBody } from "../../../src/functions/accountUserType/createAccountUserType";
import { RequsetUpdateUserTypeBody } from "../../../src/functions/accountUserType/updateAccountUserTypeBySlug";

const functions = {
  createUserType: {
    handler: "src/functions/accountUserType/createAccountUserType.handler",
    events: [
      {
        httpApi: {
          path: "/account-user-type",
          method: "post",
          bodyType: RequsetCreateUserTypeBody,
          responseData: {
            200: {
              description: "Success",
              bodyType: "AccountUserTypeResponse",
            },
          },
          swaggerTags: ["UserType"],
        },
      },
    ],
  },
  getUserTypeBySlug: {
    handler: "src/functions/accountUserType/getAccountUserTypeBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/account-user-type/{slug}",
          method: "get",
          responseData: {
            200: {
              description: "Success",
              bodyType: "AccountUserTypeResponse",
            },
          },
          swaggerTags: ["UserType"],
        },
      },
    ],
  },
  updateUserTypeBySlug: {
    handler:
      "src/functions/accountUserType/updateAccountUserTypeBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/account-user-type/{slug}",
          method: "put",
          bodyType: RequsetUpdateUserTypeBody,
          responseData: {
            200: {
              description: "Success",
              message: "Successfully Update",
            },
          },
          swaggerTags: ["UserType"],
        },
      },
    ],
  },
  removeUserTypeBySlug: {
    handler:
      "src/functions/accountUserType/removeAccountUserTypeBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/account-user-type/{slug}",
          method: "delete",
          swaggerTags: ["UserType"],
        },
      },
    ],
  },
  listUserType: {
    handler: "src/functions/accountUserType/listAccountUserType.handler",
    events: [
      {
        httpApi: {
          path: "/account-user-type",
          method: "get",
          swaggerTags: ["UserType"],
          responseData: {
            200: {
              description: "Success",
              swaggerTags: ["Users"],
              bodyType: "AccountUserTypeListResponse",
            },
          },
        },
      },
    ],
  },
};

export default functions;
