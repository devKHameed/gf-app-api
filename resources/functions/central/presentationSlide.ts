import { RequsetCreatePresentationSlideBody } from "../../../src/functions/presentationSlide/createpresentationSlide";
import { RequsetUpdatePresentationSlideBody } from "../../../src/functions/presentationSlide/updatePresentationSlideBySlug";

const functions = {
  createpresentationSlide: {
    handler: "src/functions/presentationSlide/createpresentationSlide.handler",
    events: [
      {
        httpApi: {
          path: "/presentation-slide",
          method: "post",
          swaggerTags: ["Presentation Slide"],
          bodyType: RequsetCreatePresentationSlideBody,
          responseData: {
            200: {
              bodyType: "ResponsePresentationSlide",
            },
          },
        },
      },
    ],
  },
  getPresentationSlideBySlug: {
    handler:
      "src/functions/presentationSlide/getPresentationSlideBySlug.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Presentation Slide"],
          path: "/presentation-slide/{slug}",
          method: "get",
          responseData: {
            200: {
              bodyType: "ResponsePresentationSlide",
            },
          },
        },
      },
    ],
  },
  updatePresentationSlideBySlug: {
    handler:
      "src/functions/presentationSlide/updatePresentationSlideBySlug.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Presentation Slide"],
          path: "/presentation-slide/{slug}",
          method: "put",
          bodyType: RequsetUpdatePresentationSlideBody,
        },
      },
    ],
  },
  removePresentationSlideBySlug: {
    handler:
      "src/functions/presentationSlide/removePresentationSlideBySlug.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Presentation Slide"],
          path: "/presentation-slide/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listPresentationSlide: {
    handler: "src/functions/presentationSlide/listPresentationSlide.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Presentation Slide"],
          path: "/presentation-slide",
          method: "get",
          200: {
            bodyType: "ResponsePresentationSlideList",
          },
        },
      },
    ],
  },
  sortPresentationSlide: {
    handler: "src/functions/presentationSlide/sortPresentationSlide.handler",
    events: [
      {
        httpApi: {
          path: "/presentation-slide/sort",
          method: "post",
          swaggerTags: ["Presentation Slide"],
        },
      },
    ],
  },
};
export default functions;
