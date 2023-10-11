const functions = {
  createFineTuneKnowledgebaseTopic: {
    handler:
      "src/functions/fineTuneKnowledgebaseTopic/createFineTuneKnowledgebaseTopic.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase-topic",
          method: "post",
        },
      },
    ],
  },
  getFineTuneKnowledgebaseTopicBySlug: {
    handler:
      "src/functions/fineTuneKnowledgebaseTopic/getFineTuneKnowledgebaseTopicBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase-topic/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateFineTuneKnowledgebaseTopicBySlug: {
    handler:
      "src/functions/fineTuneKnowledgebaseTopic/updateFineTuneKnowledgebaseTopicBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase-topic/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeFineTuneKnowledgebaseTopicBySlug: {
    handler:
      "src/functions/fineTuneKnowledgebaseTopic/removeFineTuneKnowledgebaseTopicBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase-topic/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listFineTuneKnowledgebaseTopic: {
    handler:
      "src/functions/fineTuneKnowledgebaseTopic/listFineTuneKnowledgebaseTopic.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase-topic",
          method: "get",
        },
      },
    ],
  },
  publishFineTuneKnowledgebaseTopic: {
    handler:
      "src/functions/fineTuneKnowledgebaseTopic/publishFineTuneKnowledgebaseTopic.handler",
    events: [
      {
        httpApi: {
          path: "/finetune-knowledgebase-topic/publish",
          method: "post",
        },
      },
    ],
  },
};
export default functions;
