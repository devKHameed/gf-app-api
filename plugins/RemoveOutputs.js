const outputs = ["ServiceEndpointWebsocket", "HttpApiId", "HttpApiUrl"];
class RemoveCfOutputs {
  constructor(serverless, options) {
    this.options = options;
    this.serverless = serverless;

    this.hooks = {
      "before:deploy:deploy": this.removeOutputs.bind(this),
    };
  }

  async removeOutputs() {
    if (
      this.serverless.service.provider.compiledCloudFormationTemplate.Outputs
    ) {
      for (let key in this.serverless.service.provider
        .compiledCloudFormationTemplate.Outputs) {
        if (!outputs.includes(key)) {
          // Delete all the other output keys that not needed
          delete this.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs[key];
        }
      }
    }
  }
}

module.exports = RemoveCfOutputs;
