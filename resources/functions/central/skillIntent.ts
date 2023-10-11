const functions = {
  createSkillIntent: {
    handler: "src/functions/skillIntent/createSkillIntent.handler",
    events: [
      {
        httpApi: {
          path: "/skill-intent",
          method: "post",
        },
      },
    ],
  },
  getSkillIntent: {
    handler: "src/functions/skillIntent/getSkillIntent.handler",
    events: [
      {
        httpApi: {
          path: "/skill-intent/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateSkillIntent: {
    handler: "src/functions/skillIntent/updateSkillIntent.handler",
    events: [
      {
        httpApi: {
          path: "/skill-intent/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeSkillIntent: {
    handler: "src/functions/skillIntent/removeSkillIntent.handler",
    events: [
      {
        httpApi: {
          path: "/skill-intent/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listSkillIntent: {
    handler: "src/functions/skillIntent/listSkillIntent.handler",
    events: [
      {
        httpApi: {
          path: "/skill-intent",
          method: "get",
        },
      },
    ],
  },
};
export default functions;
