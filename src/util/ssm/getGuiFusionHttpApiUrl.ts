import AWS from "aws-sdk";
import { APP_NAME, STAGE } from "../../config";

const ssm = new AWS.SSM();

const params = {
  Name: `${APP_NAME}-gui-fusion-${STAGE}-HttpApiUrl` /* required */,
  WithDecryption: true,
};

const getGuiFusionHttpApiUrl = async () => {
  const result = await ssm.getParameter(params).promise();
  return result?.Parameter?.Value;
};

export default getGuiFusionHttpApiUrl;
