const functions = {
  createGuiDashboardWidget: {
    handler:
      "src/functions/guiDashboardWidget/createGuiDashboardWidget.handler",
    events: [
      {
        httpApi: {
          path: "/gf-dashboard-widget",
          method: "post",
        },
      },
    ],
  },
  getGuiDashboardWidgetBySlug: {
    handler:
      "src/functions/guiDashboardWidget/getGuiDashboardWidgetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-dashboard-widget/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateGuiDashboardWidgetBySlug: {
    handler:
      "src/functions/guiDashboardWidget/updateGuiDashboardWidgetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-dashboard-widget/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeGuiDashboardWidgetBySlug: {
    handler:
      "src/functions/guiDashboardWidget/removeGuiDashboardWidgetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/gf-dashboard-widget/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listGuiDashboardWidget: {
    handler: "src/functions/guiDashboardWidget/listGuiDashboardWidget.handler",
    events: [
      {
        httpApi: {
          path: "/gf-dashboard-widget",
          method: "get",
        },
      },
    ],
  },
  createDashboardWidgetForm: {
    handler:
      "src/functions/guiDashboardWidget/createDashboardWidgetForm.handler",
    events: [
      {
        httpApi: {
          path: "/gf-dashboard-widget/{slug}/form",
          method: "post",
        },
      },
    ],
  },
  updateDashboardWidgetForm: {
    handler:
      "src/functions/guiDashboardWidget/updateDashboardWidgetForm.handler",
    events: [
      {
        httpApi: {
          path: "/gf-dashboard-widget/{slug}/form/{formId}",
          method: "put",
        },
      },
    ],
  },
};
export default functions;
