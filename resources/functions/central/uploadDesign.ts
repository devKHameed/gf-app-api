const functions = {
  createUploadDesign: {
    handler: "src/functions/uploadDesign/createUploadDesign.handler",
    events: [
      {
        httpApi: {
          path: "/upload-design",
          method: "post",
        },
      },
    ],
  },
  getUploadDesignBySlug: {
    handler: "src/functions/uploadDesign/getUploadDesignBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/upload-design/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateUploadDesignBySlug: {
    handler: "src/functions/uploadDesign/updateUploadDesignBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/upload-design/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeUploadDesignBySlug: {
    handler: "src/functions/uploadDesign/removeUploadDesignBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/upload-design/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listUploadDesign: {
    handler: "src/functions/uploadDesign/listUploadDesign.handler",
    events: [
      {
        httpApi: {
          path: "/upload-design",
          method: "get",
        },
      },
    ],
  },
  createImport: {
    handler: "src/functions/uploadDesign/createImport.handler",
    events: [
      {
        httpApi: {
          path: "/upload-design/{slug}/import",
          method: "post",
        },
      },
    ],
  },
  listImport: {
    handler: "src/functions/uploadDesign/listImport.handler",
    events: [
      {
        httpApi: {
          path: "/upload-design/{slug}/import",
          method: "get",
        },
      },
    ],
  },
  processImportFusionQueue: {
    handler: "src/functions/uploadDesign/processImportFusionQueue.handler",
    timeout: 900,
    events: [
      {
        eventBridge: {
          enabled: true,
          schedule: "rate(1 minute)",
        },
      },
    ],
  },
};

export default functions;
