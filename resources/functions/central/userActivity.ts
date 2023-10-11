const functions = {
  createUserActivityEvent: {
    handler: "src/functions/userActivity/createUserActivityEvent.handler",
    events: [
      {
        httpApi: {
          path: "/user-activity",
          method: "post",
          swaggerTags: ["UserActivity"],
        },
      },
    ],
  },
};
export default functions;
