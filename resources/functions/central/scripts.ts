const functions = {
  threePAppDuplicate: {
    handler: "src/functions/3pApp/duplicateApps.handler",
    events: [
      {
        httpApi: {
          path: "/scripts/3p-apps-duplicate",
          method: "get",
        },
      },
    ],
  },
  globalGFMLFunctionDuplicate: {
    handler: "src/functions/3pApp/duplicateGlobalGFMLFunction.handler",
    events: [
      {
        httpApi: {
          path: "/scripts/global-gfml-duplicate",
          method: "get",
        },
      },
    ],
  },
};

export default functions;
