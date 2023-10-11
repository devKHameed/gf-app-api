const functions = {
  create3pAppAction: {
    handler: "src/functions/3pAppAction/create3pAppAction.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-action/{id}",
          method: "post",
          swaggerTags: ["3PAppAction"],
          responseData: {
            200: {
              bodyType: "ThreePAppModule",
            },
          },
        },
      },
    ],
  },
  get3pAppActionBySlug: {
    handler: "src/functions/3pAppAction/get3pAppActionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-action/{id}",
          method: "get",
          swaggerTags: ["3PAppAction"],
          responseData: {
            200: {
              bodyType: "ThreePAppModule",
            },
          },
        },
      },
    ],
  },
  update3pAppActionBySlug: {
    handler: "src/functions/3pAppAction/update3pAppActionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-action/{id}",
          method: "put",
          swaggerTags: ["3PAppAction"],
        },
      },
    ],
  },
  remove3pAppActionBySlug: {
    handler: "src/functions/3pAppAction/remove3pAppActionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-action/{id}",
          method: "delete",
          swaggerTags: ["3PAppAction"],
        },
      },
    ],
  },
  list3pAppAction: {
    handler: "src/functions/3pAppAction/list3pAppAction.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-action/list/{id}",
          method: "get",
          swaggerTags: ["3PAppAction"],
          responseData: {
            200: {
              bodyType: "ThreePAppModuleList",
            },
          },
        },
      },
    ],
  },
  get3pAppActionEpochResponse: {
    handler: "src/functions/3pAppAction/get3pAppActionEpochResponse.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-action/{id}/epoch",
          method: "post",
          swaggerTags: ["3PAppAction"],
        },
      },
    ],
  },
};
export default functions;
