const functions = {
  createVectorKnowledgebaseTopic: {
    handler:
      "src/functions/vectorKnowledgebaseTopic/createVectorKnowledgebaseTopic.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase-topic",
          method: "post",
        },
      },
    ],
  },
  getVectorKnowledgebaseTopicBySlug: {
    handler:
      "src/functions/vectorKnowledgebaseTopic/getVectorKnowledgebaseTopicBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase-topic/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateVectorKnowledgebaseTopicBySlug: {
    handler:
      "src/functions/vectorKnowledgebaseTopic/updateVectorKnowledgebaseTopicBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase-topic/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeVectorKnowledgebaseTopicBySlug: {
    handler:
      "src/functions/vectorKnowledgebaseTopic/removeVectorKnowledgebaseTopicBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase-topic/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listVectorKnowledgebaseTopic: {
    handler:
      "src/functions/vectorKnowledgebaseTopic/listVectorKnowledgebaseTopic.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase-topic",
          method: "get",
        },
      },
    ],
  },
};
export default functions;
