const functions = {
  createFusionSet: {
    handler: "src/functions/fusionSet/createFusionSet.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-set",
          method: "post",
        },
      },
    ],
  },
  getFusionSetBySlug: {
    handler: "src/functions/fusionSet/getFusionSetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-set/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateFusionSetBySlug: {
    handler: "src/functions/fusionSet/updateFusionSetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-set/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeFusionSetBySlug: {
    handler: "src/functions/fusionSet/removeFusionSetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-set/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listFusionSet: {
    handler: "src/functions/fusionSet/listFusionSet.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-set",
          method: "get",
        },
      },
    ],
  },
};
export default functions;
