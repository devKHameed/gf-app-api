import { MYSQL2_LAYER, PUBLIC_SUBNET, RDS_ROLE } from "../common";

const functions = {
  // createCreditType: {
  //   handler: "src/functions/creditType/createCreditType.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/credit-type",
  //         method: "post",
  //       },
  //     },
  //   ],
  // },
  getCreditType: {
    handler: "src/functions/creditType/getCreditType.handler",
    events: [
      {
        httpApi: {
          path: "/credit-type/{slug}",
          method: "get",
        },
      },
    ],
  },
  // updateCreditType: {
  //   handler: "src/functions/creditType/updateCreditType.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/credit-type/{slug}",
  //         method: "put",
  //       },
  //     },
  //   ],
  // },
  // removeCreditType: {
  //   handler: "src/functions/creditType/removeCreditType.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/credit-type/{slug}",
  //         method: "delete",
  //       },
  //     },
  //   ],
  // },
  listCreditType: {
    handler: "src/functions/creditType/listCreditType.handler",
    events: [
      {
        httpApi: {
          path: "/credit-type",
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
