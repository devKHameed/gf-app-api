const functions = {
  runFusionTest: {
    handler: "src/functions/fusionSessions/startFusionSession.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/test",
          method: "post",
          swaggerTags: ["FusionSession"],
        },
      },
    ],
  },
  runWebhookFusion: {
    handler: "src/functions/fusionSessions/startWebhookFusion.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/webhook/{type}/{id}",
          method: "post",
          swaggerTags: ["FusionSession"],
        },
      },
    ],
  },
  runWidgetFusion: {
    handler: "src/functions/fusionSessions/startWidgetFusion.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/widget/{slug}",
          method: "post",
          swaggerTags: ["FusionSession"],
        },
      },
    ],
  },
  listFusionSession: {
    handler: "src/functions/fusionSessions/list.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/{id}/session",
          method: "get",
          swaggerTags: ["FusionSession"],
          responseData: {
            200: {
              bodyType: "FusionSessionList",
            },
          },
        },
      },
    ],
  },
  updateFusionSession: {
    handler: "src/functions/fusionSessions/updateAppSession.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/{id}/session/{slug}",
          method: "put",
          swaggerTags: ["FusionSession"],
        },
      },
    ],
  },
  runFusion: {
    handler: "src/functions/fusionSessions/startFusion.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/run/{slug}",
          method: "post",
          swaggerTags: ["FusionSession"],
        },
      },
    ],
  },
};
export default functions;
