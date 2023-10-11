import { MYSQL2_LAYER, PRIVATE_SUBNET, RDS_ROLE } from "../common";

const functions = {
  listBillingHistory: {
    handler:
      "src/functions/billingTransationHistory/listBillingTransaction.handler",
    events: [
      {
        httpApi: {
          path: "/transation-history",
          method: "get",
        },
      },
    ],
    vpc: PRIVATE_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
};

export default functions;
