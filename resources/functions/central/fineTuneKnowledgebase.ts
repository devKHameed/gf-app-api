const functions = {
  createFineTuneKnowledgebase: {
    handler:
      "src/functions/fineTuneKnowledgebase/createFineTuneKnowledgebase.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase",
          method: "post",
        },
      },
    ],
  },
  getFineTuneKnowledgebaseBySlug: {
    handler:
      "src/functions/fineTuneKnowledgebase/getFineTuneKnowledgebaseBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateFineTuneKnowledgebaseBySlug: {
    handler:
      "src/functions/fineTuneKnowledgebase/updateFineTuneKnowledgebaseBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeFineTuneKnowledgebaseBySlug: {
    handler:
      "src/functions/fineTuneKnowledgebase/removeFineTuneKnowledgebaseBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listFineTuneKnowledgebase: {
    handler:
      "src/functions/fineTuneKnowledgebase/listFineTuneKnowledgebase.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase",
          method: "get",
        },
      },
    ],
  },
  createFineTuneMessage: {
    handler: "src/functions/fineTuneKnowledgebase/createMessage.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase/message/{slug}",
          method: "post",
        },
      },
    ],
  },
  listFineTuneMessages: {
    handler: "src/functions/fineTuneKnowledgebase/listMessages.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase/message/{slug}",
          method: "get",
        },
      },
    ],
  },
};
export default functions;
