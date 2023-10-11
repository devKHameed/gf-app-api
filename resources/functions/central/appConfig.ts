const functions = {
  getAppConfig: {
    handler: "src/functions/appConfig/get.handler",
    events: [
      {
        httpApi: {
          path: "/app-config",
          method: "get",
        },
      },
    ],
  },
};

export default functions;
