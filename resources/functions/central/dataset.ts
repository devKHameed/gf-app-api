import { RequsetCreateDatasetBody } from "../../../src/functions/dataset/createDataset";
import { RequsetUpdateDatasetBody } from "../../../src/functions/dataset/updateDatasetBySlug";
import { MYSQL2_LAYER, PRIVATE_SUBNET, PUBLIC_SUBNET, RDS_ROLE } from "../common";

const functions = {
  createDataset: {
    handler: "src/functions/dataset/createDataset.handler",
    events: [
      {
        httpApi: {
          path: "/dataset",
          method: "post",
          bodyType: RequsetCreateDatasetBody,
          swaggerTags: ["Datasets"],
          responseData: {
            200: {
              bodyType: "ResponseDataset",
            },
          },
        },
      },
    ],
    vpc: PRIVATE_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getDatasetBySlug: {
    handler: "src/functions/dataset/getDatasetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/dataset/{datasetDesignSlug}/{slug}",
          method: "get",
          swaggerTags: ["Datasets"],
          responseData: {
            200: {
              bodyType: "ResponseDataset",
            },
          },
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  updateDatasetBySlug: {
    handler: "src/functions/dataset/updateDatasetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/dataset/{datasetDesignSlug}/{slug}",
          method: "put",
          swaggerTags: ["Datasets"],
          bodyType: RequsetUpdateDatasetBody,
        },
      },
    ],

    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  removeDatasetBySlug: {
    handler: "src/functions/dataset/removeDatasetBySlug.handler",
    events: [
      {
        httpApi: {
          path: "/dataset/{datasetDesignSlug}/{slug}",
          method: "delete",
          swaggerTags: ["Datasets"],
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listDataset: {
    handler: "src/functions/dataset/listDataset.handler",
    events: [
      {
        httpApi: {
          path: "/dataset/list/{datasetDesignSlug}",
          method: "get",
          swaggerTags: ["Datasets"],
          responseData: {
            200: {
              bodyType: "ResponseDatasetList",
            },
          },
          queryStringParameters: {
            title: {
              type: "string",
            },
            dataset_type_slug: {
              type: "string",
            },
          },
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getWorkflowStatusOptions: {
    handler: "src/functions/dataset/getWorkflowStatusOptions.handler",
    events: [
      {
        httpApi: {
          path: "/dataset/workflow-status-options/{datasetDesignSlug}/{statusFieldSlug}",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
};

export default functions;
