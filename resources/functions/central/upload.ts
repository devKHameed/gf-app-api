import { InitialUploadRequest } from "../../../src/functions/upload/initialUpload";

const functions = {
  initialUpload: {
    handler: "src/functions/upload/initialUpload.handler",
    events: [
      {
        httpApi: {
          path: "/initial-upload",
          method: "post",
          bodyType: InitialUploadRequest,
          swaggerTags: ["Upload"],
          // responseData: {
          //   200: {
          //     bodyType: "ResponseContactType",
          //   },
          // },
        },
      },
    ],
    iamRoleStatements: [
      {
        Effect: "Allow",
        Action: "s3:*",
        Resource: [
          "arn:aws:s3:::${self:custom.MediaBucketName}",
          "arn:aws:s3:::${self:custom.MediaBucketName}/*",
        ],
      },
    ],
  },
};

export default functions;
