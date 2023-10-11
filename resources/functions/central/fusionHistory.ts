const functions = {
  getFusionHistory: {
    handler: "src/functions/fusions/get-fusion-history.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/history/{id}",
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
  listFusionHistory: {
    handler: "src/functions/fusions/list-fusion-history.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/{fusion_slug}/history",
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
};
export default functions;
