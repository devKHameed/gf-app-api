import { ACCOUNTS_TABLE_NAME, envTableNames } from "../config";
import { dynamodb } from "../helpers/db";
import { Account } from "../types";

const getAccount = async (accountId: string) => {
  if (accountId) {
    const account = await dynamodb
      .get({
        TableName: `${envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS}`,
        Key: {
          id: ACCOUNTS_TABLE_NAME,
          slug: accountId,
        },
      })
      .then((res) => res.Item);
    
    return account as Account;
  }
  return null;
};

export default getAccount;
