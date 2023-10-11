const functions = {
  createIcon: {
    handler: "src/functions/icon/createIcon.handler",
    events: [
      {
        httpApi: {
          path: "/icon",
          method: "post",
        },
      },
    ],
  },
  getIconBySlug: {
    handler: "src/functions/icon/getIconBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/icon/{iconType}/{slug}",
          method: "get",
        },
      },
    ],
  },
  removeIconBySlug: {
    handler: "src/functions/icon/removeIconBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/icon/{iconType}/{slug}",
          method: "delete",
        },
      },
    ],
  },
  updateIconBySlug: {
    handler: "src/functions/icon/updateIconBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/icon/{iconType}/{slug}",
          method: "put",
        },
      },
    ],
  },
  listIcon: {
    handler: "src/functions/icon/listIcon.handler",
    events: [
      {
        httpApi: {
          path: "/icon",
          method: "get",
        },
      },
    ],
  },
};

export default functions;
