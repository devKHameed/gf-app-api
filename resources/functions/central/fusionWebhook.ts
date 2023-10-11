const functions = {
  createFusionWebhook: {
    handler: "src/functions/fusionWebhooks/create.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/webhook",
          method: "post",
          swaggerTags: ["FusionWebhook"],
          responseData: {
            200: {
              bodyType: "FusionWebhook",
            },
          },
        },
      },
    ],
  },
  listFusionWebhook: {
    handler: "src/functions/fusionWebhooks/list.handler",
    events: [
      {
        httpApi: {
          path: "/fusion/webhook/{module_slug}",
          method: "get",
          swaggerTags: ["FusionWebhook"],
          responseData: {
            200: {
              bodyType: "FusionWebhookList",
            },
          },
        },
      },
    ],
  },
};
export default functions;
