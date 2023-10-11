const functions = {
  createCard: {
    handler: "src/functions/card/addCard.handler",
    events: [
      {
        httpApi: {
          path: "/card",
          method: "post",

          swaggerTags: ["Card"],
          responseData: {
            200: {
              bodyType: "ResponseCard",
            },
          },
        },
      },
    ],
  },
  makeCardPrimary: {
    handler: "src/functions/card/makeCardPrimary.handler",
    events: [
      {
        httpApi: {
          path: "/card/make-primary/{slug}",
          method: "put",
          swaggerTags: ["Card"],
        },
      },
    ],
  },
  removeCardBySlug: {
    handler: "src/functions/card/removeCard.handler",
    events: [
      {
        httpApi: {
          path: "/card/{slug}",
          method: "delete",
          swaggerTags: ["Card"],
        },
      },
    ],
  },
  listCard: {
    handler: "src/functions/card/listCards.handler",
    events: [
      {
        httpApi: {
          path: "/card",
          method: "get",
          swaggerTags: ["Card"],
          responseData: {
            200: {
              bodyType: "ResponseCardList",
            },
          },
        },
      },
    ],
  },
};
export default functions;
