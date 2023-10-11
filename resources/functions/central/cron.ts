import { APP_NAME } from "../common";

const BUS_PREF = `${APP_NAME}-\${sls:stage}`;

const functions = {
  sendFusionSessionNotification: {
    handler:
      "src/functions/fusionSessions/sendFusionSessionNotification.handler",
    events: [
      {
        eventBridge: {
          enabled: true,
          eventBus: `${BUS_PREF}-FusionEvents`,
          pattern: {
            source: [`${BUS_PREF}-FusionEvents`],
            "detail-type": [`${BUS_PREF}-FusionSession`],
          },
        },
      },
    ],
  },
  generateFusionOperatorLogs: {
    handler: "src/functions/fusionSessions/generateFusionOperatorLogs.handler",
    events: [
      {
        eventBridge: {
          enabled: true,
          eventBus: `${BUS_PREF}-FusionEvents`,
          pattern: {
            source: [`${BUS_PREF}-FusionEvents`],
            "detail-type": [`${BUS_PREF}-OperatorLog`],
          },
        },
      },
    ],
  },
};

export default functions;
