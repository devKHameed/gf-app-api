import {
  CognitoUserAttribute,
  CognitoUserPool,
} from "amazon-cognito-identity-js";
import {
  PUBLIC_COGNITO_CLIENT_ID,
  PUBLIC_COGNITO_USER_POOL,
} from "../../config";

const poolData = {
  UserPoolId: PUBLIC_COGNITO_USER_POOL!,
  ClientId: PUBLIC_COGNITO_CLIENT_ID!,
};
export async function signUpUserWithEmail({
  username,
  email,
  password,
}: {
  username: string;
  email: string;
  password: string;
}) {
  return new Promise(function (resolve, reject) {
    // define pool data

    console.log("poolData", poolData);
    const userPool = new CognitoUserPool(poolData);

    const attributeList = [];

    const dataEmail = {
      Name: "email",
      Value: email,
    };

    const attributeEmail = new CognitoUserAttribute(dataEmail);

    attributeList.push(attributeEmail);
    console.log("attributeList", attributeList);
    userPool.signUp(username, password, attributeList, [], function (err, res) {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  }).catch((err) => {
    console.log("err", err);
    throw err;
  });
}
