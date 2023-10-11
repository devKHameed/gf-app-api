const AWS = require("aws-sdk");
class StoreWebsocketInSSM {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.hooks = {
      "after:deploy:deploy": this.storeWebsocketUrl.bind(this),
    };
  }

  async storeWebsocketUrl() {
    // console.log("storeWebsocketUrl", this.serverless);
    const customStackName = `${this.serverless.service.service}-${this.serverless.service.provider.stage}`;
    const stackName = this.serverless.service.stackName || customStackName;
    const region = this.serverless.service.provider.region;

    const cloudFormation = new AWS.CloudFormation({ region });
    const ssm = new AWS.SSM({ region });

    // console.log("stackName", stackName);
    // console.log("customStackName", customStackName);

    // Get stack outputs
    const { Stacks } = await cloudFormation
      .describeStacks({ StackName: stackName })
      .promise();
    // console.log("Stacks[0].Outputs", Stacks);
    const outputs = Stacks[0].Outputs;

    for (let output of outputs) {
      await ssm
        .putParameter({
          Name: output.ExportName?.replace("sls-", ""), // Change the Name according to your preference
          Type: "String",
          Value: output.OutputValue,
          Overwrite: true,
        })
        .promise();
      this.serverless.cli.log(
        `Stored ${output.OutputKey} ${output.OutputValue} in SSM`
      );
    }
  }
}

module.exports = StoreWebsocketInSSM;
