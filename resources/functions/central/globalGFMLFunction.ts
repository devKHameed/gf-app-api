const functions = {
  createGlobalGFMLFunction: {
    handler:
      "src/functions/globalGFMLFunction/createGlobalGFMLFunction.handler",
    events: [
      {
        httpApi: {
          path: "/global-gfml-function",
          method: "post",
          swaggerTags: ["GFMLFunction"],
          responseData: {
            200: {
              bodyType: "GFMLFunction",
            },
          },
        },
      },
    ],
  },
  getGlobalGFMLFunctionBySlug: {
    handler:
      "src/functions/globalGFMLFunction/getGlobalGFMLFunctionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/global-gfml-function/{slug}",
          method: "get",
          swaggerTags: ["GFMLFunction"],
          responseData: {
            200: {
              bodyType: "GFMLFunction",
            },
          },
        },
      },
    ],
  },
  updateGlobalGFMLFunctionBySlug: {
    handler:
      "src/functions/globalGFMLFunction/updateGlobalGFMLFunctionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/global-gfml-function/{slug}",
          method: "put",
          swaggerTags: ["GFMLFunction"],
        },
      },
    ],
  },
  removeGlobalGFMLFunctionBySlug: {
    handler:
      "src/functions/globalGFMLFunction/removeGlobalGFMLFunctionBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/global-gfml-function/{slug}",
          method: "delete",
          swaggerTags: ["GFMLFunction"],
        },
      },
    ],
  },
  listGlobalGFMLFunction: {
    handler: "src/functions/globalGFMLFunction/listGlobalGFMLFunction.handler",
    events: [
      {
        httpApi: {
          path: "/global-gfml-function",
          method: "get",
          swaggerTags: ["GFMLFunction"],
          responseData: {
            200: {
              bodyType: "GFMLFunctionList",
            },
          },
        },
      },
    ],
  },
  listFusionGlobalGFMLFunction: {
    handler:
      "src/functions/fusionGlobalGFMLFunctions/listFusionGlobalGFMLFunction.handler",
    events: [
      {
        httpApi: {
          path: "/global-gfml-function/groups",
          method: "get",
          swaggerTags: ["GFMLFunction"],
          responseData: {
            200: {
              bodyType: "GFMLFunctionGroup",
            },
          },
        },
      },
    ],
  },
};
export default functions;
