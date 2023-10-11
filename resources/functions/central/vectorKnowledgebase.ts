const functions = {
  createVectorKnowledgebase: {
    handler:
      "src/functions/vectorKnowledgebase/createVectorKnowledgebase.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase",
          method: "post",
        },
      },
    ],
  },
  getVectorKnowledgebaseBySlug: {
    handler:
      "src/functions/vectorKnowledgebase/getVectorKnowledgebaseBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateVectorKnowledgebaseBySlug: {
    handler:
      "src/functions/vectorKnowledgebase/updateVectorKnowledgebaseBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeVectorKnowledgebaseBySlug: {
    handler:
      "src/functions/vectorKnowledgebase/removeVectorKnowledgebaseBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listVectorKnowledgebase: {
    handler:
      "src/functions/vectorKnowledgebase/listVectorKnowledgebase.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase",
          method: "get",
        },
      },
    ],
  },
  createVectorMessage: {
    handler: "src/functions/vectorKnowledgebase/createMessage.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase/message/{slug}",
          method: "post",
        },
      },
    ],
  },
  listVectorMessages: {
    handler: "src/functions/vectorKnowledgebase/listMessages.handler",
    events: [
      {
        httpApi: {
          path: "/vector-knowledgebase/message/{slug}",
          method: "get",
        },
      },
    ],
  },
};
export default functions;
