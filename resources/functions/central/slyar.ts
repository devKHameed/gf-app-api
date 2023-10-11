const functions = {
  initSylarChat: {
    handler: "src/functions/sylar/initializeSylarChat.handler",
    events: [
      {
        httpApi: {
          path: "/sylar/chat-init",
          method: "post",
        },
      },
    ],
  },
};
export default functions;
