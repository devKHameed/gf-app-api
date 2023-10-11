const functions = {
  // createPackage: {
  //   handler: "src/functions/package/createPackage.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/package",
  //         method: "post",
  //       },
  //     },
  //   ],
  // },
  getPackage: {
    handler: "src/functions/package/getPackage.handler",
    events: [
      {
        httpApi: {
          path: "/package/{slug}",
          method: "get",
        },
      },
    ],
  },
  // updatePackage: {
  //   handler: "src/functions/package/updatePackage.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/package/{slug}",
  //         method: "put",
  //       },
  //     },
  //   ],
  // },
  // removePackage: {
  //   handler: "src/functions/package/removePackage.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/package/{slug}",
  //         method: "delete",
  //       },
  //     },
  //   ],
  // },
  listPackage: {
    handler: "src/functions/package/listPackage.handler",
    events: [
      {
        httpApi: {
          path: "/package",
          method: "get",
        },
      },
    ],
  },
};

export default functions;
