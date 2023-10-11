import { RequsetCreateFusionFlowBody } from "../../../src/functions/fusionFlow/createFusionFlow";
import { RequsetUpdateFusionFlowBody } from "../../../src/functions/fusionFlow/updateFusionFlowBySlug";

const functions = {
  createFusionFlow: {
    handler: "src/functions/fusionFlow/createFusionFlow.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-flow",
          method: "post",
          swaggerTags: ["Fusion Flow"],
          bodyType: RequsetCreateFusionFlowBody,
          responseData: {
            200: {
              bodyType: "Fusion",
            },
          },
        },
      },
    ],
  },
  getFusionFlowBySlug: {
    handler: "src/functions/fusionFlow/getFusionFlowBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-flow/{id}",
          method: "get",
          swaggerTags: ["Fusion Flow"],
          responseData: {
            200: {
              bodyType: "Fusion",
            },
          },
        },
      },
    ],
  },
  updateFusionFlowBySlug: {
    handler: "src/functions/fusionFlow/updateFusionFlowBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-flow/{id}",
          method: "put",
          swaggerTags: ["Fusion Flow"],
          bodyType: RequsetUpdateFusionFlowBody,
        },
      },
    ],
  },
  removeFusionFlowBySlug: {
    handler: "src/functions/fusionFlow/removeFusionFlowBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-flow/{id}",
          method: "delete",
          swaggerTags: ["Fusion Flow"],
        },
      },
    ],
  },
  listFusionFlow: {
    handler: "src/functions/fusionFlow/listFusionFlow.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-flow",
          method: "get",
          swaggerTags: ["Fusion Flow"],
          responseData: {
            200: {
              bodyType: "FusionList",
            },
          },
        },
      },
    ],
  },
  listFusionActionV2: {
    handler: "src/functions/fusion3pApps/listModuleDetailV2.handler",
    events: [
      {
        httpApi: {
          path: "/fusion-flow/{id}/action",
          method: "get",
          swaggerTags: ["Fusion"],
          responseData: {
            200: {
              bodyType: "ThreePAppModuleList",
            },
          },
        },
      },
    ],
  },
};
export default functions;
