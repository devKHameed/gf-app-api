const functions = {
  create3pAppRP: {
    handler: "src/functions/3pAppRP/create3pAppRP.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-rp/{id}",
          method: "post",
          swaggerTags: ["3PAppRP"],
          responseData: {
            200: {
              bodyType: "ThreePAppRemoteProcedure",
            },
          },
        },
      },
    ],
  },
  get3pAppRPBySlug: {
    handler: "src/functions/3pAppRP/get3pAppRPBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-rp/{id}",
          method: "get",
          swaggerTags: ["3PAppRP"],
          responseData: {
            200: {
              bodyType: "ThreePAppRemoteProcedure",
            },
          },
        },
      },
    ],
  },
  update3pAppRPBySlug: {
    handler: "src/functions/3pAppRP/update3pAppRPBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-rp/{id}",
          method: "put",
          swaggerTags: ["3PAppRP"],
        },
      },
    ],
  },
  remove3pAppRPBySlug: {
    handler: "src/functions/3pAppRP/remove3pAppRPBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-rp/{id}",
          method: "delete",
          swaggerTags: ["3PAppRP"],
        },
      },
    ],
  },
  list3pAppRP: {
    handler: "src/functions/3pAppRP/list3pAppRP.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-rp/list/{id}",
          method: "get",
          swaggerTags: ["3PAppRP"],
          responseData: {
            200: {
              bodyType: "ThreePAppRemoteProcedureList",
            },
          },
        },
      },
    ],
  },
  execute3pAppRP: {
    handler: "src/functions/3pAppRP/execute3pAppRP.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-rp/execute",
          method: "post",
          swaggerTags: ["3PAppRP"],
        },
      },
    ],
  },
};
export default functions;
