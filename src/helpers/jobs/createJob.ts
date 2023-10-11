import { DynamoDB } from "aws-sdk";
import { Knex } from "knex";
import { JobSession } from "types/Job";
import {
  ACCOUNT_JOB_SESSION_DATA_TABLE_NAME,
  ACCOUNT_JOB_SESSION_TABLE_NAME,
  envTableNames,
} from "../../config";

const dynamoDb = new DynamoDB.DocumentClient();

const createJob = async ({
  knex,
  accountId,
  skillId,
  userId,
  title,
  note,
  data,
  status = "Open",
  skillSessionId,
}: {
  knex: Knex;
  accountId: string;
  userId: string;
  skillId: string;
  skillSessionId: number;
  title?: string;
  note?: string;
  data?: Record<string, any>;
  status: "Awaiting Instruction" | "Open";
}) => {
  const [session_id] = await knex<JobSession>(ACCOUNT_JOB_SESSION_TABLE_NAME)
    .insert({
      account_id: accountId,
      user_id: userId,
      related_skill_id: skillId,
      title,
      skill_session_id: skillSessionId,
      start_date_time: new Date(),
      status: status,
      note: note,
    })
    .returning("session_id");

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_JOB_SESSION_DATA,
    Item: {
      id: `${accountId}${ACCOUNT_JOB_SESSION_DATA_TABLE_NAME}`,
      slug: `${session_id}`,
      session_data: data,
      related_skill_id: skillId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: 1,
      is_deleted: 0,
    },
  };

  await dynamoDb.put(params).promise();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return [session_id];
};

export default createJob;
