const functions = {
  createEvent: {
    handler: "src/functions/event/createEvent.handler",
    events: [
      {
        httpApi: {
          path: "/event",
          method: "post",
          swaggerTags: ["EventStorage"],
        },
      },
    ],
  },
  listEventByEventId: {
    handler: "src/functions/event/listEventByEventId.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["EventStorage"],
          path: "/event/{eventId}/{contactId}",
          method: "get",
        },
      },
    ],
  },
};
export default functions;
