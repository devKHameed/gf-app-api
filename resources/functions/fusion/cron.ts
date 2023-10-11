import { MYSQL2_LAYER, PRIVATE_SUBNET } from "../common";

const functions = {
  runScheduledFusion: {
    handler: "src/functions/fusionSessions/runScheduledFusion.handler",
    events: [
      {
        eventBridge: {
          enabled: true,
          schedule: "cron(* * * * ? *)",
        },
      },
    ],
    vpc: PRIVATE_SUBNET,
    layers: [MYSQL2_LAYER],
  },
};

export default functions;
