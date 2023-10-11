const functions = {
  create3pAppConnection: {
    handler: "src/functions/3pAppConnection/create3pAppConnection.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-connection/{id}",
          method: "post",
          swaggerTags: ["3PAppConnection"],
          responseData: {
            200: {
              bodyType: "ThreePAppConnection",
            },
          },
        },
      },
    ],
  },
  get3pAppConnectionBySlug: {
    handler: "src/functions/3pAppConnection/get3pAppConnectionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-connection/{id}",
          method: "get",
          swaggerTags: ["3PAppConnection"],
          responseData: {
            200: {
              bodyType: "ThreePAppConnection",
            },
          },
        },
      },
    ],
  },
  update3pAppConnectionBySlug: {
    handler:
      "src/functions/3pAppConnection/update3pAppConnectionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-connection/{id}",
          method: "put",
          swaggerTags: ["3PAppConnection"],
        },
      },
    ],
  },
  remove3pAppConnectionBySlug: {
    handler:
      "src/functions/3pAppConnection/remove3pAppConnectionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-connection/{id}",
          method: "delete",
          swaggerTags: ["3PAppConnection"],
        },
      },
    ],
  },
  list3pAppConnection: {
    handler: "src/functions/3pAppConnection/list3pAppConnection.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-connection/list/{id}",
          method: "get",
          swaggerTags: ["3PAppConnection"],
          responseData: {
            200: {
              bodyType: "ThreePAppConnectionList",
            },
          },
        },
      },
    ],
  },
};
export default functions;
