const functions = {
  updateRecordTag: {
    handler: "src/functions/universalTag/updateRecordTag.handler",
    events: [
      {
        httpApi: {
          path: "/universal-tag",
          method: "post",
        },
      },
    ],
  },
  updateReocrdTagBulk: {
    handler: "src/functions/universalTag/updateReocrdTagBulk.handler",
    events: [
      {
        httpApi: {
          path: "/universal-tag/bulk-update",
          method: "put",
        },
      },
    ],
  },
  listRecordTags: {
    handler: "src/functions/universalTag/listRecordTags.handler",
    events: [
      {
        httpApi: {
          path: "/universal-tag/{record_type}",
          method: "get",
        },
      },
    ],
  },
};

export default functions;
