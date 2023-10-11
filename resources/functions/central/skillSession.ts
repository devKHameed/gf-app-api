import { MYSQL2_LAYER, PUBLIC_SUBNET, RDS_ROLE } from "../common";

const functions = {
  closeSkillSession: {
    handler: "src/functions/skillSession/closeSkillSession.handler",
    events: [
      {
        httpApi: {
          path: "/skill-session/close/{session_id}",
          method: "put",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getSkillSession: {
    handler: "src/functions/skillSession/getSkillSession.handler",
    events: [
      {
        httpApi: {
          path: "/skill-session/{session_id}",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listSkillSession: {
    handler: "src/functions/skillSession/listSkillSession.handler",
    events: [
      {
        httpApi: {
          path: "/skill-session",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  openSkillSession: {
    handler: "src/functions/skillSession/openSkillSession.handler",
    events: [
      {
        httpApi: {
          path: "/skill-session/open",
          method: "post",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listSkillSessionData: {
    handler: "src/functions/skillSession/listSkillSessionData.handler",
    events: [
      {
        httpApi: {
          path: "/skill-session-data",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getSkillSessionData: {
    handler: "src/functions/skillSession/getSkillSessionData.handler",
    events: [
      {
        httpApi: {
          path: "/skill-session-data/{session_id}",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  updateSessionData: {
    handler: "src/functions/skillSession/updateSessionData.handler",
    events: [
      {
        httpApi: {
          path: "/skill-session-data/{session_id}",
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
