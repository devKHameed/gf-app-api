import { DynamoDB } from "aws-sdk";
import { Knex } from "knex";
import { SkillSession } from "types/Skill";
import {
  ACCOUNT_SKILL_SESSION_DATA_TABLE_NAME,
  ACCOUNT_SKILL_SESSION_TABLE_NAME,
  envTableNames,
} from "../../config";

const dynamoDb = new DynamoDB.DocumentClient();

const createSkill = async ({
  knex,
  accountId,
  skillId,
  userId,
  note,
  data = {},
  status = "Open",
}: {
  knex: Knex;
  accountId: string;
  userId: string;
  skillId: string;
  note?: string;
  data?: Record<string, any>;
  status?: "Awaiting Instruction" | "Open";
}): Promise<[Pick<SkillSession, "session_id">]> => {
  const [session_id] = await knex<SkillSession>(
    ACCOUNT_SKILL_SESSION_TABLE_NAME
  )
    .insert({
      account_id: accountId,
      user_id: userId,

      skill_id: skillId,
      start_date_time: new Date(),
      status: "Open",
      note: note,
    })
    .returning("session_id");

  const skillSessionDataInput: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_SKILL_SESSION_DATA,
    Item: {
      id: `${accountId}${ACCOUNT_SKILL_SESSION_DATA_TABLE_NAME}`,
      slug: `${session_id}`,
      session_data: data,
      skill_id: skillId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: 1,
      is_deleted: 0,
    },
  };

  await dynamoDb.put(skillSessionDataInput).promise();

  return [session_id];
};

export default createSkill;
