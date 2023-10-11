import { AWSError } from "aws-sdk";
import DynamoDB, { DocumentClient } from "aws-sdk/clients/dynamodb";
import STS from "aws-sdk/clients/sts";
import { PromiseResult } from "aws-sdk/lib/request";
import {
  ACCT_NAME,
  MAIN_ACCT_ACCESS_ROLE_ARN,
  MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
  REGION,
} from "../../config";

const stsClient = new STS();

type DynamoDBMethod =
  | "get"
  | "put"
  | "delete"
  | "update"
  | "batchWrite"
  | "batchGet"
  | "query"
  | "scan"
  | "transactGet"
  | "transactWrite";

type DynamoDBRequestParams<T extends DynamoDBMethod> = T extends "get"
  ? DocumentClient.GetItemInput
  : T extends "put"
  ? DocumentClient.PutItemInput
  : T extends "delete"
  ? DocumentClient.DeleteItemInput
  : T extends "update"
  ? DocumentClient.UpdateItemInput
  : T extends "batchWrite"
  ? DocumentClient.BatchWriteItemInput
  : T extends "batchGet"
  ? DocumentClient.BatchGetItemInput
  : T extends "query"
  ? DocumentClient.QueryInput
  : T extends "scan"
  ? DocumentClient.ScanInput
  : T extends "transactGet"
  ? DocumentClient.TransactGetItemsInput
  : T extends "transactWrite"
  ? DocumentClient.TransactWriteItemsInput
  : never;

type DynamoDBResponse<T extends DynamoDBMethod> = T extends "get"
  ? DocumentClient.GetItemOutput
  : T extends "put"
  ? DocumentClient.PutItemOutput
  : T extends "delete"
  ? DocumentClient
  : T extends "update"
  ? DocumentClient.UpdateItemOutput
  : T extends "batchWrite"
  ? DocumentClient.BatchWriteItemOutput
  : T extends "batchGet"
  ? DocumentClient.BatchGetItemOutput
  : T extends "query"
  ? DocumentClient.QueryOutput
  : T extends "scan"
  ? DocumentClient.ScanOutput
  : T extends "transactGet"
  ? DocumentClient.TransactGetItemsOutput
  : T extends "transactWrite"
  ? DocumentClient.TransactWriteItemsOutput
  : never;

class DB {
  dynamodb: DynamoDB.DocumentClient;
  RETRY_COUNT = 3;

  constructor() {
    this.dynamodb = new DocumentClient({
      region: REGION,
    });
  }

  private async _getMainDBCredentials() {
    if (!MAIN_ACCT_ACCESS_ROLE_ARN || !MAIN_ACCT_ACCESS_ROLE_SESSION_NAME) {
      throw new Error(
        "MAIN_ACCT_ACCESS_ROLE_ARN and MAIN_ACCT_ACCESS_ROLE_SESSION_NAME must be specified"
      );
    }

    const stsSession = await stsClient
      .assumeRole({
        RoleArn: MAIN_ACCT_ACCESS_ROLE_ARN,
        RoleSessionName: MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
      })
      .promise();

    if (!stsSession.Credentials) {
      throw new Error(`Could not assume role ${MAIN_ACCT_ACCESS_ROLE_ARN}`);
    }

    return stsSession.Credentials;
  }

  async initMainAccountDB() {
    let db = new DocumentClient();
    if (ACCT_NAME !== "main") {
      const { AccessKeyId, SecretAccessKey, SessionToken } =
        await this._getMainDBCredentials();
      db = new DocumentClient({
        accessKeyId: AccessKeyId,
        secretAccessKey: SecretAccessKey,
        sessionToken: SessionToken,
        region: REGION,
      });
      // console.log("Connected to main account database");
    }

    this.dynamodb = db;
    return this.dynamodb;
  }

  async _makeRequest<T extends DynamoDBMethod>(
    method: T,
    params: DynamoDBRequestParams<T>,
    retryCount = 0
  ): Promise<PromiseResult<DynamoDBResponse<T>, AWSError>> {
    try {
      switch (method) {
        case "get":
          return (await this.dynamodb
            .get(params as DynamoDBRequestParams<"get">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "put":
          return (await this.dynamodb
            .put(params as DynamoDBRequestParams<"put">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "delete":
          return (await this.dynamodb
            .delete(params as DynamoDBRequestParams<"delete">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "batchGet":
          return (await this.dynamodb
            .batchGet(params as DynamoDBRequestParams<"batchGet">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "update":
          return (await this.dynamodb
            .update(params as DynamoDBRequestParams<"update">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "batchWrite":
          return (await this.dynamodb
            .batchWrite(params as DynamoDBRequestParams<"batchWrite">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "query":
          return (await this.dynamodb
            .query(params as DynamoDBRequestParams<"query">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "scan":
          return (await this.dynamodb
            .scan(params as DynamoDBRequestParams<"scan">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "transactGet":
          return (await this.dynamodb
            .transactGet(params as DynamoDBRequestParams<"transactGet">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        case "transactWrite":
          return (await this.dynamodb
            .transactWrite(params as DynamoDBRequestParams<"transactWrite">)
            .promise()) as PromiseResult<DynamoDBResponse<T>, AWSError>;
        default:
          throw new Error(`Unknown method ${method}`);
      }
    } catch (e) {
      const error = e as AWSError;

      if (error.code === "ExpiredToken" && retryCount < this.RETRY_COUNT) {
        await this.initMainAccountDB();
        return this._makeRequest(method, params, retryCount + 1);
      } else {
        throw error;
      }
    }
  }

  async get(params: DynamoDBRequestParams<"get">, logLevel: 0 | 1 | 2 = 0) {
    if (logLevel > 0) {
      console.log("DynamoDB.get", params);
    }
    const res = await this._makeRequest("get", params);
    if (logLevel > 1) {
      console.log("DynamoDB.get.result", JSON.stringify(res.Item ?? "{}"));
    }
    return res;
  }

  async put(params: DynamoDBRequestParams<"put">, logLevel: 0 | 1 | 2 = 0) {
    if (logLevel > 0) {
      console.log("DynamoDB.put", params);
    }
    const res = await this._makeRequest("put", params);
    if (logLevel > 1) {
      console.log(
        "DynamoDB.put.result",
        JSON.stringify(res.Attributes ?? "{}")
      );
    }
    return res;
  }

  async delete(
    params: DynamoDBRequestParams<"delete">,
    logLevel: 0 | 1 | 2 = 0
  ) {
    if (logLevel > 0) {
      console.log("DynamoDB.delete", params);
    }
    const res = await this._makeRequest("delete", params);
    if (logLevel > 1) {
      console.log("DynamoDB.delete.result", JSON.stringify("true"));
    }
    return res;
  }

  async update(
    params: DynamoDBRequestParams<"update">,
    logLevel: 0 | 1 | 2 = 0
  ) {
    if (logLevel > 0) {
      console.log("DynamoDB.update", params);
    }
    const res = await this._makeRequest("update", params);
    if (logLevel > 1) {
      console.log(
        "DynamoDB.update.result",
        JSON.stringify(res.Attributes ?? "{}")
      );
    }
    return res;
  }

  async batchGet(
    params: DynamoDBRequestParams<"batchGet">,
    logLevel: 0 | 1 | 2 = 0
  ) {
    if (logLevel > 0) {
      console.log("DynamoDB.batchGet", params);
    }
    const res = await this._makeRequest("batchGet", params);
    if (logLevel > 1) {
      console.log(
        "DynamoDB.batchGet.result",
        JSON.stringify(res.Responses ?? "{}")
      );
    }
    return res;
  }

  async batchWrite(
    params: DynamoDBRequestParams<"batchWrite">,
    logLevel: 0 | 1 | 2 = 0
  ) {
    if (logLevel > 0) {
      console.log("DynamoDB.batchWrite", params);
    }
    const res = await this._makeRequest("batchWrite", params);
    if (logLevel > 1) {
      console.log(
        "DynamoDB.batchWrite.result",
        JSON.stringify(res.UnprocessedItems ?? "{}")
      );
    }
    return res;
  }

  async query(params: DynamoDBRequestParams<"query">, logLevel: 0 | 1 | 2 = 0) {
    if (logLevel > 0) {
      console.log("DynamoDB.query", params);
    }
    const res = await this._makeRequest("query", params);

    if (logLevel > 1) {
      console.log("DynamoDB.query.result", JSON.stringify(res.Items ?? "{}"));
    }
    return res;
  }

  async scan(params: DynamoDBRequestParams<"scan">, logLevel: 0 | 1 | 2 = 0) {
    if (logLevel > 0) {
      console.log("DynamoDB.scan", params);
    }
    const res = await this._makeRequest("scan", params);
    if (logLevel > 1) {
      console.log("DynamoDB.scan.result", JSON.stringify(res.Items ?? "{}"));
    }
    return res;
  }

  async transactGet(
    params: DynamoDBRequestParams<"transactGet">,
    logLevel: 0 | 1 | 2 = 0
  ) {
    if (logLevel > 0) {
      console.log("DynamoDB.transactGet", params);
    }

    const res = await this._makeRequest("transactGet", params);
    if (logLevel > 1) {
      console.log(
        "DynamoDB.transactGet.result",
        JSON.stringify(res.Responses ?? "{}")
      );
    }
    return res;
  }

  async transactWrite(
    params: DynamoDBRequestParams<"transactWrite">,
    logLevel: 0 | 1 | 2 = 0
  ) {
    if (logLevel > 0) {
      console.log("DynamoDB.transactWrite", params);
    }
    const res = await this._makeRequest("transactWrite", params);
    if (logLevel > 1) {
      console.log("DynamoDB.transactWrite.result", JSON.stringify(true));
    }
    return res;
  }
}

const dynamodb = new DB();

async function* paginatedQuery<DataType = unknown>(
  query: DynamoDB.DocumentClient.QueryInput
) {
  const res = await dynamodb.query(query);
  let items = {
      items: res.Items as DataType[],
      lastEvaluatedKey: res.LastEvaluatedKey,
    },
    lastEvaluatedKey = res.LastEvaluatedKey;
  yield items;

  while (lastEvaluatedKey) {
    const res = await dynamodb.query({
      ...query,
      ExclusiveStartKey: lastEvaluatedKey,
    });
    lastEvaluatedKey = res.LastEvaluatedKey;
    items = {
      items: res.Items as DataType[],
      lastEvaluatedKey: lastEvaluatedKey,
    };
    yield items;
  }
}

const queryAll = async <DataType = unknown>(
  query: DynamoDB.DocumentClient.QueryInput
) => {
  let lastEvaluatedKey: DynamoDB.DocumentClient.Key | undefined = undefined;
  const items: DataType[] = [];

  do {
    const res: PromiseResult<DynamoDB.DocumentClient.QueryOutput, AWSError> =
      await dynamodb.query({ ...query, ExclusiveStartKey: lastEvaluatedKey });
    items.push(...(res.Items as DataType[]));
    lastEvaluatedKey = res.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
};

const batchGetAll = async <DataType = unknown>(
  tableName: string,
  keys: DynamoDB.DocumentClient.Key[],
  options?: DynamoDB.DocumentClient.KeysAndAttributes
) => {
  let startIndex = 0,
    endIndex = 100;
  let batch = keys.slice(startIndex, endIndex);
  const items: DataType[] = [];
  do {
    const { Responses = {}, UnprocessedKeys } = await dynamodb.batchGet({
      RequestItems: {
        [tableName]: {
          Keys: batch,
          ...(options || {}),
        },
      },
    });

    items.push(...((Responses[tableName] || []) as DataType[]));

    batch = UnprocessedKeys?.[tableName].Keys || [];
    startIndex = endIndex;
    endIndex += 100 - batch.length;
    batch.push(...keys.slice(startIndex, endIndex));
  } while (batch.length > 0);

  return items;
};

export { batchGetAll, dynamodb, paginatedQuery, queryAll };
