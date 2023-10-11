"use strict";

module.exports = {
  "AWS::ApiGatewayV2::Integration": {
    destination: "Integration",
    allowSuffix: true,
    resourcesLimit: 180,
  },
  "AWS::ApiGatewayV2::Route": {
    destination: "Route",
    allowSuffix: true,
    resourcesLimit: 180,
  },
};
