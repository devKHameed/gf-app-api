import { MYSQL2_LAYER, PUBLIC_SUBNET, RDS_ROLE } from "../common";

const functions = {
  createMedia: {
    handler: "src/functions/media/createMedia.handler",
    events: [
      {
        httpApi: {
          path: "/media",
          method: "post",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listMedia: {
    handler: "src/functions/media/listMedia.handler",
    events: [
      {
        httpApi: {
          path: "/media",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  deleteMedia: {
    handler: "src/functions/media/deleteMedia.handler",
    events: [
      {
        httpApi: {
          path: "/media/{id}",
          method: "delete",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getMedia: {
    handler: "src/functions/media/getMedia.handler",
    events: [
      {
        httpApi: {
          path: "/media/{id}",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  updateMedia: {
    handler: "src/functions/media/updateMedia.handler",
    events: [
      {
        httpApi: {
          path: "/media/{id}",
          method: "put",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
};

export default functions;
