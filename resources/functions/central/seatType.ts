const functions = {
  // createSeatType: {
  //   handler: "src/functions/seatType/createSeatType.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/seat-type",
  //         method: "post",
  //       },
  //     },
  //   ],
  // },
  getSeatType: {
    handler: "src/functions/seatType/getSeatType.handler",
    events: [
      {
        httpApi: {
          path: "/seat-type/{slug}",
          method: "get",
        },
      },
    ],
  },
  // updateSeatType: {
  //   handler: "src/functions/seatType/updateSeatType.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/seat-type/{slug}",
  //         method: "put",
  //       },
  //     },
  //   ],
  // },
  // removeSeatType: {
  //   handler: "src/functions/seatType/removeSeatType.handler",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/seat-type/{slug}",
  //         method: "delete",
  //       },
  //     },
  //   ],
  // },
  listSeatType: {
    handler: "src/functions/seatType/listSeatType.handler",
    events: [
      {
        httpApi: {
          path: "/seat-type",
          method: "get",
        },
      },
    ],
  },
};

export default functions;
