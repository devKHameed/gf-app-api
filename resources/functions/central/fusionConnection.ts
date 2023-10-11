const functions = {
  createFusionConnection: {
    handler: "src/functions/fusionConnections/create.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/connection",
          method: "post",
          swaggerTags: ["FusionConnection"],
          responseData: {
            200: {
              bodyType: "FusionConnection",
            },
          },
        },
      },
    ],
  },
  updateFusionConnection: {
    handler: "src/functions/fusionConnections/update.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/connection/{id}",
          method: "put",
          swaggerTags: ["FusionConnection"],
          responseData: {
            200: {
              bodyType: "FusionConnection",
            },
          },
        },
      },
    ],
  },
  listFusionConnection: {
    handler: "src/functions/fusionConnections/list.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/connection/{app_id}",
          method: "get",
          swaggerTags: ["FusionConnection"],
          responseData: {
            200: {
              bodyType: "FusionConnectionList",
            },
          },
        },
      },
    ],
  },
};
export default functions;
