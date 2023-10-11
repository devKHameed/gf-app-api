import { RequsetCreatePresentationBody } from "../../../src/functions/presentation/createPresentation";
import { RequsetUpdatePresentationBody } from "../../../src/functions/presentation/updatePresentationBySlug";

const functions = {
  createPresentation: {
    handler: "src/functions/presentation/createPresentation.handler",
    events: [
      {
        httpApi: {
          path: "/presentation",
          method: "post",
          swaggerTags: ["Presentation"],
          bodyType: RequsetCreatePresentationBody,
          responseData: {
            200: {
              bodyType: "ResponsePresentation",
            },
          },
        },
      },
    ],
  },
  getPresentationBySlug: {
    handler: "src/functions/presentation/getPresentationBySlug.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Presentation"],
          path: "/presentation/{slug}",
          method: "get",
          responseData: {
            200: {
              bodyType: "ResponsePresentation",
            },
          },
        },
      },
    ],
  },
  updatePresentationBySlug: {
    handler: "src/functions/presentation/updatePresentationBySlug.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Presentation"],
          path: "/presentation/{slug}",
          method: "put",
          bodyType: RequsetUpdatePresentationBody,
        },
      },
    ],
  },
  removePresentationBySlug: {
    handler: "src/functions/presentation/removePresentationBySlug.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Presentation"],
          path: "/presentation/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listPresentation: {
    handler: "src/functions/presentation/listPresentation.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Presentation"],
          path: "/presentation",
          method: "get",
          200: {
            bodyType: "ResponsePresentationList",
          },
        },
      },
    ],
  },
};
export default functions;
