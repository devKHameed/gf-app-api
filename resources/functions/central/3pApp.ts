const functions = {
  create3pApp: {
    handler: "src/functions/3pApp/create3pApp.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps",
          method: "post",
          swaggerTags: ["3PApp"],
          responseData: {
            200: {
              bodyType: "ThreePAppV2",
            },
          },
        },
      },
    ],
  },
  createNew3pAppRelease: {
    handler: "src/functions/3pApp/createNew3pAppRelease.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-release",
          method: "post",
          swaggerTags: ["3PApp"],
          responseData: {
            200: {
              bodyType: "ThreePAppV2",
            },
          },
        },
      },
    ],
  },
  createNew3pAppVersion: {
    handler: "src/functions/3pApp/createNew3pAppVersion.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-version",
          method: "post",
          swaggerTags: ["3PApp"],
          responseData: {
            200: {
              bodyType: "ThreePAppV2",
            },
          },
        },
      },
    ],
  },
  get3pAppBySlug: {
    handler: "src/functions/3pApp/get3pAppBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps/{slug}",
          method: "get",
          swaggerTags: ["3PApp"],
          responseData: {
            200: {
              bodyType: "ThreePAppV2",
            },
          },
        },
      },
    ],
  },
  update3pAppBySlug: {
    handler: "src/functions/3pApp/update3pAppBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps/{slug}",
          method: "put",
          swaggerTags: ["3PApp"],
        },
      },
    ],
  },
  remove3pAppBySlug: {
    handler: "src/functions/3pApp/remove3pAppBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps/{slug}",
          method: "delete",
          swaggerTags: ["3PApp"],
        },
      },
    ],
  },
  list3pApp: {
    handler: "src/functions/3pApp/list3pApp.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps",
          method: "get",
          swaggerTags: ["3PApp"],
          responseData: {
            200: {
              bodyType: "ThreePAppV2ReponseList",
            },
          },
        },
      },
    ],
  },
  parse3PExpression: {
    handler: "src/functions/3pApp/parseExpression.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps/parse-expression",
          method: "post",
          swaggerTags: ["3PApp"],
        },
      },
    ],
  },
  import3pApp: {
    handler: "src/functions/3pApp/import3pApp.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps/import",
          method: "post",
          swaggerTags: ["3PApp"],
        },
      },
    ],
    iamRoleStatements: [
      {
        Effect: "Allow",
        Action: "s3:*",
        Resource: ["arn:aws:s3:::*", "arn:aws:s3:::*/*"],
      },
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
        Action: "ssm:GetParameter",
        Resource: "*",
      },
    ],
  },
};
export default functions;
