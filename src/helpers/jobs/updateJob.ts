import { Knex } from "knex";
import { JobSession } from "types/Job";
import { ACCOUNT_JOB_SESSION_TABLE_NAME } from "../../config";

const updateJob = async ({
  knex,
  key,
  data,
}: {
  knex: Knex;

  key: string;
  data: Partial<JobSession>;
}) => {
  return await knex<JobSession>(ACCOUNT_JOB_SESSION_TABLE_NAME)
    .update(data)
    .where("session_id", key);
};
export default updateJob;
