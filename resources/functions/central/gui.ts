import { RequsetCreateGuiBody } from "../../../src/functions/gui/createGui";
import { RequsetUpdateGuiBody } from "../../../src/functions/gui/updateGuiBySlug";

const functions = {
  createGui: {
    handler: "src/functions/gui/createGui.handler",
    events: [
      {
        httpApi: {
          path: "/gui",
          swaggerTags: ["Gui"],
          bodyType: RequsetCreateGuiBody,
          method: "post",
        },
      },
    ],
  },
  getGuiBySlug: {
    handler: "src/functions/gui/getGuiBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gui/{slug}",
          swaggerTags: ["Gui"],
          method: "get",
        },
      },
    ],
  },
  updateGuiBySlug: {
    handler: "src/functions/gui/updateGuiBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gui/{slug}",
          swaggerTags: ["Gui"],
          bodyType: RequsetUpdateGuiBody,
          method: "put",
        },
      },
    ],
  },
  removeGuiBySlug: {
    handler: "src/functions/gui/removeGuiBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gui/{slug}",
          swaggerTags: ["Gui"],
          method: "delete",
        },
      },
    ],
  },
  listGui: {
    handler: "src/functions/gui/listGui.handler",
    events: [
      {
        httpApi: {
          path: "/gui",
          swaggerTags: ["Gui"],
          method: "get",
        },
      },
    ],
  },
};

export default functions;
