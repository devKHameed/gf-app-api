declare module "lazystream" {
  class Readable {
    constructor(streamFunc: () => any);
  }
}
