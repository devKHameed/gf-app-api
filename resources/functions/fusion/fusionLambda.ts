import { MYSQL2_LAYER, PRIVATE_SUBNET } from "../common";

const functions = {
  sessionInit: {
    timeout: 900,
    handler: "src/functions/fusionSessions/sessionInit.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  // executeOperator: {
  //   timeout: 900,
  //   handler: "src/functions/fusionSessions/executeOperator.handler",
  // },
  processChartDataOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processChartDataOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  processOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  processCrudOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processCrudOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  testAurora: {
    timeout: 900,
    handler: "src/functions/aurora/test2.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    url: true,
  },
  // processAutomationOperator: {
  //   timeout: 900,
  //   handler: "src/functions/fusionSessions/processAutomationOperator.handler",
  //   maximumRetryAttempts: 0,
  //   layers: [MYSQL2_LAYER],
  //   vpc: PRIVATE_SUBNET,
  //   memorySize: 2048,
  // },
  // processGetNextTaskOperator: {
  //   timeout: 900,
  //   handler: "src/functions/fusionSessions/processGetNextTaskOperator.handler",
  //   maximumRetryAttempts: 0,
  //   layers: [MYSQL2_LAYER],
  //   vpc: PRIVATE_SUBNET,
  //   memorySize: 2048,
  // },
  // processCompleteTaskOperator: {
  //   timeout: 900,
  //   handler: "src/functions/fusionSessions/processCompleteTaskOperator.handler",
  //   maximumRetryAttempts: 0,
  //   layers: [MYSQL2_LAYER],
  //   vpc: PRIVATE_SUBNET,
  //   memorySize: 2048,
  // },
  // processChatOperator: {
  //   timeout: 900,
  //   handler: "src/functions/fusionSessions/processChatOperator.handler",
  //   maximumRetryAttempts: 0,
  //   layers: [MYSQL2_LAYER],
  //   vpc: PRIVATE_SUBNET,
  //   memorySize: 2048,
  // },
  processChartOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processChartOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  // processStripeOperator: {
  //   timeout: 900,
  //   handler: "src/functions/fusionSessions/processStripeOperator.handler",
  //   maximumRetryAttempts: 0,
  //   layers: [MYSQL2_LAYER],
  //   vpc: PRIVATE_SUBNET,
  //   memorySize: 2048,
  // },
  processRestApiOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processRestApiOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  processFlowControlOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processFlowControlOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  processBasicSystemOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processBasicSystemOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  processSkillOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processSkillOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  processUpdateDisplayAsync: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processUpdateDisplayAsync.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  processAWSOperator: {
    timeout: 900,
    handler: "src/functions/fusionSessions/processAWSOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  processWebhookResponseOperator: {
    timeout: 900,
    handler:
      "src/functions/fusionSessions/processWebhookResponseOperator.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  // completeFusionSession: {
  //   timeout: 900,
  //   handler: "src/functions/fusionSessions/completeFusionSession.handler",
  // },
};

export default functions;
