const functions = {
  create3pAppGFMLFunction: {
    handler: "src/functions/3pAppGFMLFunction/create3pAppGFMLFunction.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-gfml-function/{id}",
          method: "post",
          swaggerTags: ["3PAppGFMLFunction"],
          responseData: {
            200: {
              bodyType: "GFMLFunction",
            },
          },
        },
      },
    ],
  },
  get3pAppGFMLFunctionBySlug: {
    handler:
      "src/functions/3pAppGFMLFunction/get3pAppGFMLFunctionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-gfml-function/{id}",
          method: "get",
          swaggerTags: ["3PAppGFMLFunction"],
          responseData: {
            200: {
              bodyType: "GFMLFunction",
            },
          },
        },
      },
    ],
  },
  update3pAppGFMLFunctionBySlug: {
    handler:
      "src/functions/3pAppGFMLFunction/update3pAppGFMLFunctionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-gfml-function/{id}",
          method: "put",
          swaggerTags: ["3PAppGFMLFunction"],
        },
      },
    ],
  },
  remove3pAppGFMLFunctionBySlug: {
    handler:
      "src/functions/3pAppGFMLFunction/remove3pAppGFMLFunctionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-gfml-function/{id}",
          method: "delete",
          swaggerTags: ["3PAppGFMLFunction"],
        },
      },
    ],
  },
  list3pAppGFMLFunction: {
    handler: "src/functions/3pAppGFMLFunction/list3pAppGFMLFunction.handler",
    events: [
      {
        httpApi: {
          path: "/3p-apps-gfml-function/list/{id}",
          method: "get",
          swaggerTags: ["3PAppGFMLFunction"],
          responseData: {
            200: {
              bodyType: "GFMLFunctionList",
            },
          },
        },
      },
    ],
  },
};
export default functions;
