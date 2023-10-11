import { MYSQL2_LAYER, PUBLIC_SUBNET, RDS_ROLE } from "../common";

const functions = {
  testAurora: {
    handler: "src/functions/aurora/test.handler",
    events: [
      {
        httpApi: {
          path: "/aurora",
          method: "get",
          swaggerTags: ["Aurora"],
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  migrationV1: {
    handler: "src/functions/aurora/migration1.handler",
    events: [
      {
        httpApi: {
          path: "/aurora/migration/v1",
          method: "post",
          swaggerTags: ["Aurora"],
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
};
export default functions;
