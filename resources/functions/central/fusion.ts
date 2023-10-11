const functions = {
  createFusion: {
    handler: "src/functions/fusions/create.handler",
    events: [
      {
        httpApi: {
          path: "/fusion",
          method: "post",
          swaggerTags: ["Fusion"],
          responseData: {
            200: {
              bodyType: "Fusion",
            },
          },
        },
      },
    ],
  },
  getFusion: {
    handler: "src/functions/fusions/get.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/{id}",
          method: "get",
          swaggerTags: ["Fusion"],
          responseData: {
            200: {
              bodyType: "Fusion",
            },
          },
        },
      },
    ],
  },
  updateFusion: {
    handler: "src/functions/fusions/update.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/{id}",
          method: "put",
          swaggerTags: ["Fusion"],
        },
      },
    ],
  },
  removeFusion: {
    handler: "src/functions/fusions/delete.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/{id}",
          method: "delete",
          swaggerTags: ["Fusion"],
        },
      },
    ],
  },
  listFusion: {
    handler: "src/functions/fusions/list.handler",
    events: [
      {
        httpApi: {
          path: "/fusion",
          method: "get",
          swaggerTags: ["Fusion"],
          responseData: {
            200: {
              bodyType: "FusionList",
            },
          },
        },
      },
    ],
  },
  listFusionAction: {
    handler: "src/functions/fusion3pApps/listModuleDetail.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/{id}/action",
          method: "get",
          swaggerTags: ["Fusion"],
          responseData: {
            200: {
              bodyType: "ThreePAppModuleList",
            },
          },
        },
      },
    ],
  },
  importFusion: {
    handler: "src/functions/fusions/import.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/import",
          method: "post",
          swaggerTags: ["Fusion"],
          responseData: {
            200: {
              bodyType: "Fusion",
            },
          },
        },
      },
    ],
  },
};
export default functions;
