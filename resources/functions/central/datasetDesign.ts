import { RequsetCreateDatasetDesignBody } from "../../../src/functions/datasetDesign/createDatasetDesign";
import { RequsetUpdateDatasetDesignBody } from "../../../src/functions/datasetDesign/updateDatasetDesignBySlug";
import { MYSQL2_LAYER, PUBLIC_SUBNET, RDS_ROLE } from "../common";

const functions = {
  createDatasetDesign: {
    handler: "src/functions/datasetDesign/createDatasetDesign.handler",
    events: [
      {
        httpApi: {
          path: "/dataset-design",
          method: "post",
          swaggerTags: ["Dataset Design"],
          bodyType: RequsetCreateDatasetDesignBody,
          responseData: {
            200: {
              bodyType: "ResponseDatasetDesign",
            },
          },
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  importDatasetDesign: {
    handler: "src/functions/datasetDesign/importDatasetDesign.handler",
    events: [
      {
        httpApi: {
          path: "/dataset-design/import",
          method: "post",
          swaggerTags: ["Dataset Design"],
          bodyType: RequsetCreateDatasetDesignBody,
          responseData: {
            200: {
              bodyType: "ResponseDatasetDesign",
            },
          },
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getDatasetDesignBySlug: {
    handler: "src/functions/datasetDesign/getDatasetDesignBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/dataset-design/{slug}",
          method: "get",
          swaggerTags: ["Dataset Design"],
          responseData: {
            200: {
              bodyType: "ResponseDatasetDesign",
            },
          },
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  updateDatasetDesignBySlug: {
    handler: "src/functions/datasetDesign/updateDatasetDesignBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/dataset-design/{slug}",
          method: "put",
          swaggerTags: ["Dataset Design"],
          bodyType: RequsetUpdateDatasetDesignBody,
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  removeDatasetDesignBySlug: {
    handler: "src/functions/datasetDesign/removeDatasetDesignBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/dataset-design/{slug}",
          method: "delete",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listDatasetDesign: {
    handler: "src/functions/datasetDesign/listDatasetDesign.handler",
    events: [
      {
        httpApi: {
          path: "/dataset-design",
          method: "get",
          swaggerTags: ["Dataset Design"],
          responseData: {
            200: {
              bodyType: "ResponseDatasetDesignList",
            },
          },
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  exportDatasetDesignBySlug: {
    handler: "src/functions/datasetDesign/exportDatasetDesignBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/dataset-design/export/{slug}",
          method: "get",
          swaggerTags: ["Dataset Design"],
          responseData: {
            200: {
              bodyType: "ResponseDatasetDesign",
            },
          },
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  exportDatasetDesignByFolder: {
    handler: "src/functions/datasetDesign/exportDatasetDesignByFolder.handler",
    events: [
      {
        httpApi: {
          path: "/dataset-design/export/folder/{slug}",
          method: "get",
          swaggerTags: ["Dataset Design"],
          responseData: {
            200: {
              bodyType: "ResponseDatasetDesign",
            },
          },
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
};

export default functions;
