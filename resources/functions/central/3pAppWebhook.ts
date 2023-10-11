const functions = {
  create3pAppWebhook: {
    handler: "src/functions/3pAppWebhook/create3pAppWebhook.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-webhook/{id}",
          method: "post",
          swaggerTags: ["3PAppWebhook"],
          responseData: {
            200: {
              bodyType: "ThreePAppWebhook",
            },
          },
        },
      },
    ],
  },
  get3pAppWebhookBySlug: {
    handler: "src/functions/3pAppWebhook/get3pAppWebhookBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-webhook/{id}",
          method: "get",
          swaggerTags: ["3PAppWebhook"],
          responseData: {
            200: {
              bodyType: "ThreePAppWebhook",
            },
          },
        },
      },
    ],
  },
  update3pAppWebhookBySlug: {
    handler: "src/functions/3pAppWebhook/update3pAppWebhookBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-webhook/{id}",
          method: "put",
          swaggerTags: ["3PAppWebhook"],
        },
      },
    ],
  },
  remove3pAppWebhookBySlug: {
    handler: "src/functions/3pAppWebhook/remove3pAppWebhookBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-webhook/{id}",
          method: "delete",
          swaggerTags: ["3PAppWebhook"],
        },
      },
    ],
  },
  list3pAppWebhook: {
    handler: "src/functions/3pAppWebhook/list3pAppWebhook.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-webhook/list/{id}",
          method: "get",
          swaggerTags: ["3PAppWebhook"],
          responseData: {
            200: {
              bodyType: "ThreePAppWebhookList",
            },
          },
        },
      },
    ],
  },
};
export default functions;
