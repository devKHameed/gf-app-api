import { RequsetCreateGFAppBody } from "../../../src/functions/gfApps/createGFApp";
import { RequsetUpdateGFAppBody } from "../../../src/functions/gfApps/updateGFAppBySlug";

const functions = {
  createGFApp: {
    handler: "src/functions/gfApps/createGFApp.handler",
    events: [
      {
        httpApi: {
          path: "/gf-app",
          method: "post",
          bodyType: RequsetCreateGFAppBody,
          swaggerTags: ["GF App"],
          responseData: {
            200: {
              bodyType: "ResponseGFApp",
            },
          },
        },
      },
    ],
  },
  getGFAppBySlug: {
    handler: "src/functions/gfApps/getGFAppBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-app/{slug}",
          method: "get",
          swaggerTags: ["GF App"],
          responseData: {
            200: {
              bodyType: "ResponseGFApp",
            },
          },
        },
      },
    ],
  },
  updateGFAppBySlug: {
    handler: "src/functions/gfApps/updateGFAppBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-app/{slug}",
          method: "put",
          bodyType: RequsetUpdateGFAppBody,
          swaggerTags: ["GF App"],
        },
      },
    ],
  },
  removeGFAppBySlug: {
    handler: "src/functions/gfApps/removeGFAppBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-app/{slug}",
          method: "delete",
          swaggerTags: ["GF App"],
        },
      },
    ],
  },
  listGFApp: {
    handler: "src/functions/gfApps/listGFApp.handler",
    events: [
      {
        httpApi: {
          path: "/gf-app",
          method: "get",
          swaggerTags: ["GF App"],
          responseData: {
            200: {
              bodyType: "ResponseGFAppList",
            },
          },
        },
      },
    ],
  },
};
export default functions;
