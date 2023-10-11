const functions = {
  createUniversalEvent: {
    handler: "src/functions/universalEvent/createUniversalEvent.handler",
    events: [
      {
        httpApi: {
          path: "/universal-event",
          method: "post",
        },
      },
    ],
  },
  getUniversalEventBySlug: {
    handler: "src/functions/universalEvent/getUniversalEventBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/universal-event/{record_type}/{slug}",
          method: "get",
        },
      },
    ],
  },
  removeUniversalEventBySlug: {
    handler: "src/functions/universalEvent/removeUniversalEventBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/universal-event/{record_type}/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listUniversalEvent: {
    handler: "src/functions/universalEvent/listUniversalEvent.handler",
    events: [
      {
        httpApi: {
          path: "/universal-event/{record_type}",
          method: "get",
        },
      },
    ],
  },
};

export default functions;
