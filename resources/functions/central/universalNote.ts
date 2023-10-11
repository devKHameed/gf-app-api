const functions = {
  createUniversalNote: {
    handler: "src/functions/universalNote/createUniversalNote.handler",
    events: [
      {
        httpApi: {
          path: "/universal-note",
          method: "post",
        },
      },
    ],
  },
  getUniversalNoteBySlug: {
    handler: "src/functions/universalNote/getUniversalNoteBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/universal-note/{noteType}/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateUniversalNoteBySlug: {
    handler: "src/functions/universalNote/updateUniversalNoteBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/universal-note/{noteType}/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeUniversalNoteBySlug: {
    handler: "src/functions/universalNote/removeUniversalNoteBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/universal-note/{noteType}/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listUniversalNote: {
    handler: "src/functions/universalNote/listUniversalNote.handler",
    events: [
      {
        httpApi: {
          path: "/universal-note/{noteType}",
          method: "get",
        },
      },
    ],
  },
};
export default functions;
