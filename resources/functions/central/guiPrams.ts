const functions = {
  createGuiParam: {
    handler: "src/functions/guiParam/createGuiParam.handler",
    events: [
      {
        httpApi: {
          path: "/gui-param",
          method: "post",
        },
      },
    ],
  },
  getGuiParam: {
    handler: "src/functions/guiParam/getGuiParam.handler",
    events: [
      {
        httpApi: {
          path: "/gui-param/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateGuiParam: {
    handler: "src/functions/guiParam/updateGuiParam.handler",
    events: [
      {
        httpApi: {
          path: "/gui-param/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeGuiParam: {
    handler: "src/functions/guiParam/removeGuiParam.handler",
    events: [
      {
        httpApi: {
          path: "/gui-param/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listGuiParams: {
    handler: "src/functions/guiParam/listGuiParams.handler",
    events: [
      {
        httpApi: {
          path: "/gui-param",
          method: "get",
        },
      },
    ],
  },
};

export default functions;
