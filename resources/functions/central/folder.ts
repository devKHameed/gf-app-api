import { RequsetCreateFolderBody } from "../../../src/functions/folder/createFolder";
import { RequsetUpdateFolderBody } from "../../../src/functions/folder/updateFolderBySlug";

const functions = {
  createFolder: {
    handler: "src/functions/folder/createFolder.handler",
    events: [
      {
        httpApi: {
          path: "/folder",
          method: "post",
          swaggerTags: ["Folder"],
          bodyType: RequsetCreateFolderBody,
        },
      },
    ],
  },
  listFolder: {
    handler: "src/functions/folder/listFolder.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Folder"],
          path: "/folder",
          method: "get",
        },
      },
    ],
  },
  updateFolderBySlug: {
    handler: "src/functions/folder/updateFolderBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/folder/{slug}",
          method: "put",
          swaggerTags: ["Folder"],
          bodyType: RequsetUpdateFolderBody,
        },
      },
    ],
  },
  folderSort: {
    handler: "src/functions/folder/sortFolder.handler",
    events: [
      {
        httpApi: {
          swaggerTags: ["Folder"],
          path: "/folder/sort",
          method: "post",
        },
      },
    ],
  },
};
export default functions;
