const functions = {
  createGFGui: {
    handler: "src/functions/gfGui/createGFGui.handler",
    events: [
      {
        httpApi: {
          path: "/gf-gui",
          method: "post",
        },
      },
    ],
  },
  getGFGuiBySlug: {
    handler: "src/functions/gfGui/getGFGuiBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-gui/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateGFGuiBySlug: {
    handler: "src/functions/gfGui/updateGFGuiBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-gui/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeGFGuiBySlug: {
    handler: "src/functions/gfGui/removeGFGuiBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-gui/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listGFGui: {
    handler: "src/functions/gfGui/listGFGui.handler",
    events: [
      {
        httpApi: {
          path: "/gf-gui",
          method: "get",
        },
      },
    ],
  },
  createGuiFusion: {
    handler: "src/functions/gfGui/createGuiFusion.handler",
    events: [
      {
        httpApi: {
          path: "/gf-gui/fusion",
          method: "post",
        },
      },
    ],
  },
  createReviewerAction: {
    handler: "src/functions/guiReviewer/createReviewerAction.handler",
    events: [
      {
        httpApi: {
          path: "/gf-gui/reviewer-action/{guiSlug}",
          method: "post",
        },
      },
    ],
  },
  createDatasetAction: {
    handler: "src/functions/guiDataset/createDatasetAction.handler",
    events: [
      {
        httpApi: {
          path: "/gf-gui/dataset-action/{guiSlug}",
          method: "post",
        },
      },
    ],
  },
};
export default functions;
