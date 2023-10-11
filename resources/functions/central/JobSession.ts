import { MYSQL2_LAYER, PUBLIC_SUBNET, RDS_ROLE } from "../common";

const functions = {
  closeJobSession: {
    handler: "src/functions/jobSession/closeJobSession.handler",
    events: [
      {
        httpApi: {
          path: "/job-session/close/{session_id}",
          method: "put",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getJobSession: {
    handler: "src/functions/jobSession/getJobSession.handler",
    events: [
      {
        httpApi: {
          path: "/job-session/{session_id}",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listJobSession: {
    handler: "src/functions/jobSession/listJobSession.handler",
    events: [
      {
        httpApi: {
          path: "/job-session",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  openJobSession: {
    handler: "src/functions/jobSession/openJobSession.handler",
    events: [
      {
        httpApi: {
          path: "/job-session/open",
          method: "post",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listJobSessionData: {
    handler: "src/functions/jobSession/listJobSessionData.handler",
    events: [
      {
        httpApi: {
          path: "/job-session-data",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getJobSessionData: {
    handler: "src/functions/jobSession/getJobSessionData.handler",
    events: [
      {
        httpApi: {
          path: "/job-session-data/{session_id}",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  updateSessionData: {
    handler: "src/functions/jobSession/updateSessionData.handler",
    events: [
      {
        httpApi: {
          path: "/job-session-data/{session_id}",
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
