const functions = {
  getFusionFlowHistoryBySlug: {
    handler: "src/functions/fusionFlow/getFusionFlowHistoryBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-flow/history/{id}",
          method: "get",
          swaggerTags: ["Fusion Flow History"],
          responseData: {
            200: {
              bodyType: "Fusion",
            },
          },
        },
      },
    ],
  },
  listFusionFlowHistory: {
    handler: "src/functions/fusionFlow/listFusionFlowHistory.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-flow/{fusion_slug}/history",
          method: "get",
          swaggerTags: ["Fusion Flow History"],
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
