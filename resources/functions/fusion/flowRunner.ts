import { MYSQL2_LAYER, PRIVATE_SUBNET } from "../common";

const functions = {
  sessionInitializer: {
    timeout: 900,
    handler: "src/functions/flowRunner/sessionInitializer.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
  sessionExecutor: {
    timeout: 900,
    handler: "src/functions/flowRunner/sessionExecutor.handler",
    maximumRetryAttempts: 0,
    layers: [MYSQL2_LAYER],
    vpc: PRIVATE_SUBNET,
    memorySize: 2048,
  },
};

export default functions;
