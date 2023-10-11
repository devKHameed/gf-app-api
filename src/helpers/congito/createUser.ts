// import some middlewares
import CognitoIdentityServiceProvider from "aws-sdk/clients/cognitoidentityserviceprovider";
import { PUBLIC_COGNITO_USER_POOL } from "../../config";

const cognitoIdp = new CognitoIdentityServiceProvider();
const USERPOOLID = PUBLIC_COGNITO_USER_POOL!;

const createCongitoUser = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  try {
    // Create in User Pool
    await cognitoIdp
      .adminCreateUser({
        UserPoolId: USERPOOLID,
        Username: email,
        TemporaryPassword: password,
        UserAttributes: [
          {
            Name: "email",
            Value: email,
          },
        ],
      })
      .promise();

    // Set permanent user password
    await cognitoIdp
      .adminSetUserPassword({
        UserPoolId: USERPOOLID,
        Username: email,
        Password: password,
        Permanent: true,
      })
      .promise();
  } catch (error: unknown) {
    console.log("error", error);
    throw error;
  }
};

export default createCongitoUser;
