import { DynamoDB } from "aws-sdk";
import axios, { AxiosResponse } from "axios";
import { FusionSession } from "types";
import {
  ACCOUNT_JOB_SESSION_DATA_TABLE_NAME,
  ACCOUNT_JOB_SESSION_TABLE_NAME,
  ACCOUNT_SKILL_SESSION_TABLE_NAME,
  MEDIA_BUCKET_NAME,
  OPEN_AI_API_KEY,
  WEBSOCKET_URL,
  envTableNames,
} from "../../../config";
import { EVENT_TYPES } from "../../../constants/event";
import {
  getS3Client,
  triggerQueueItem,
  uploadSessionOperationToS3,
} from "../../../helpers/fusion";
import { getNextQueueItem } from "../../../helpers/fusion/executionQueue";
import updateJob from "../../../helpers/jobs/updateJob";
import connectKnex from "../../../helpers/knex/connect";
import { JobSession, JobSessionData } from "../../../types/Job";
import { SkillSession } from "../../../types/Skill";
import { SylarSession, SylarSessionMessage } from "../../../types/Sylar";
import { getUserBySlug } from "../../../util";
import { updateSession } from "../../../util/3pModule";
import getAccount from "../../../util/getAccount";
import {
  extractCloseJobId,
  extractStartJobId,
  getUserLastMessage,
} from "../../../util/sylar";
import { getUserSocketConnection } from "../helper";
import { emit } from "../util";
import { handleSkillDetection } from "./handleSkillDetection";
import { createSessionMessage } from "./sessionMessages";

const apiKey = OPEN_AI_API_KEY;

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatRequest {
  model:
    | "text-curie-002"
    | "text-babbage-002"
    | "text-ada-002"
    | "gpt-3.5-turbo";
  messages: Message[];
  temperature: number;
}
interface OpenAITextRequest {
  model: "text-davinci-003" | "text-davinci-002";
  prompt: string;
  temperature: number;
  max_tokens?: number;
}

interface OpenAIChatCompletion {
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
  // Add additional properties as per the actual response structure
}

interface OpenAIChatResponse {
  choices: OpenAIChatCompletion[];
  // Add additional properties as per the actual response structure
}

interface OpenAICompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: OpenAIUsage;
  choices: OpenAIChoice[];
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIChoice {
  text: string;
  index: number;
  logprobs: null | OpenAILogprobs;
  finish_reason: string;
}

interface OpenAILogprobs {
  tokens: string[];
  token_logprobs: number[];
  top_logprobs: number[][];
  text_offset: number[];
}

const dynamodb = new DynamoDB.DocumentClient();
export enum SylarEvent {
  INITIALIZE = "initialize",
  MESSAGE = "message",
  GET_SESSIONS = "get_sessions",
  GET_MESSAGES = "get_messages",
  CLOSE_SESSION = "close_session",
  GET_JOB_SESSIONS = "get_job_sessions",
  NEW_JOB_SESSION = "new_job_sessions",
  JOB_SESSION_STATUS_CHANGE = "job_sessions_status_change",
  NO_JOB_SESSION_FOUND = "no_job_session_found",
  MULTIPLE_JOB_CLOSED = "job_session_closed",
  UPDATE_DISPLAY = "update_display",
  ASK_QUESTION = "ask_question",
  ASK_QUESTION_RESPONSE = "ask_question_response",
  CHANGE_SELECTED_DISPLAY = "change_selected_display",
}
export enum SylarAction {
  SYLAR_MESSAGES = "sylar-message",
  SYLAR_EVENT = "sylar-event",
}
type Metadata = {
  uid: string;
  user_id?: string;
  account_id?: string;
  event?: {
    event_type: `${SylarEvent}`;
    session_type: "opened" | "closed";
    chat_session_id?: string;
    system_message: string;
    message: string;
  };
};

const InitialCmd = ({ firstName }: { firstName: string }) =>
  `You are Sylar, an virtual assistant. Please greet ${firstName} who is your boss, as ${firstName} is starting a new chat session with you.`;

const detectSkill = (
  skillIntents: string[]
) => `I will analyize the next string the user sends to me and match the users intent from one of the following intent items
"intent_items":[ '${skillIntents.join("', '")}' ] .
I will respond with Valid JSON formatted that can be parsed like this {"intent_identified":""} with the matching intent as the value of "intent_identified". If I am unable to match the intent I will put the string "none" in the value of "intent_identified". I will always respond with the JSON`;

const initailizeChat = async ({
  metadata,
  domainName,
  connectionId,
}: {
  metadata: Metadata;
  domainName: string;
  connectionId: string;
}) => {
  const accountId = metadata.account_id;
  const userSlug = metadata.user_id;
  const userSocketConnections = await getUserSocketConnection(userSlug!);
  const nowDate = new Date().toISOString();
  const user = await getUserBySlug(userSlug!);

  const { Items: alreadyHasOpenSession } = await dynamodb
    .query({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
      KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
      ExpressionAttributeNames: {
        "#id": "id",
        "#slug": "slug",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${userSlug}`,
        ":slug": "ISOPEN:false:",
      },
    })
    .promise();

  if (alreadyHasOpenSession?.length)
    throw new Error("Already have an open session");

  const sessionUXID = Date.now();
  const sessionSlug = `ISOPEN:false:${sessionUXID}`;

  const sylarSessionParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
    Item: {
      id: `${accountId}:${userSlug}`,
      slug: sessionSlug,
      created_at: nowDate,
      closed_at: null,
      is_open: 1,
      meta_data: {
        active_skill_session: "none",
      },
      is_deleted: 0,
    },
  };
  const sylarChatLogsParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_LOGS,
    Item: {
      id: `${accountId}:${userSlug}:${sessionUXID}`,
      slug: `${nowDate}:${EVENT_TYPES.CREATED}`,
      event_type: EVENT_TYPES.CREATED,
      created_at: nowDate,
      meta_data: {},
    },
  };

  const requestPayload: OpenAIChatRequest = {
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "" },
      {
        role: "user",
        content: InitialCmd({ firstName: user?.first_name as string }),
      },
    ],
    temperature: 1,
  };

  // console.log("------", requestPayload);
  const res = await axios
    .post<OpenAIChatResponse>(
      "https://api.openai.com/v1/chat/completions",
      requestPayload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    )
    .then((response: AxiosResponse<OpenAIChatResponse>) => {
      const responseData: OpenAIChatResponse = response.data;
      // Access response data using responseData object
      console.log(responseData.choices[0].message.content);
      return responseData;
    });

  const chatgptResposeMessage = res.choices[0].message.content;

  await emit(
    "response",
    {
      session: sylarSessionParams.Item,
      type: SylarEvent.INITIALIZE,
      uid: metadata.uid,
    },
    domainName,
    userSocketConnections,
    "sylar"
  );

  const sylarMessageParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
    Item: {
      id: `${accountId}:${userSlug}:${sessionUXID}`,
      slug: `${Date.now()}:SYLAR`,
      created_at: nowDate,
      is_open: 1,
      by_sylar: true,
      chatgpt: true,
      meta_data: {
        message: chatgptResposeMessage,
      },
      is_deleted: 0,
    },
  };

  await emit(
    SylarAction.SYLAR_MESSAGES,
    {
      isResponseComplete: true,
      message: sylarMessageParams.Item,
      type: SylarEvent.MESSAGE,
      uid: metadata.uid,
    },
    domainName,
    userSocketConnections,
    "sylar"
  ).catch((e) => {
    // handle error here
    console.error(e);
  });

  await Promise.all([
    dynamodb.put(sylarSessionParams).promise(),
    dynamodb.put(sylarMessageParams).promise(),
    dynamodb.put(sylarChatLogsParams).promise(),
  ]);
};

const getSessions = async ({
  metadata,
  domainName,
  connectionId,
}: {
  metadata: Metadata;
  domainName: string;
  connectionId: string;
}) => {
  console.log("---getSessions", metadata);
  const accountId = metadata.account_id;
  const userSlug = metadata.user_id;
  // const onlyOpenSession = metadata.event?.session_type;

  // const nowDate = new Date().toISOString();

  const OpenSession = "ISOPEN:false:";

  const ClosedSession = "ISCLOSED:false";

  const openSessionsPromise = dynamodb
    .query({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
      KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
      ExpressionAttributeNames: {
        "#id": "id",
        "#slug": "slug",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${userSlug}`,
        ":slug": OpenSession,
      },
    })
    .promise();
  const closedSessionsPromise = dynamodb
    .query({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
      KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
      ExpressionAttributeNames: {
        "#id": "id",
        "#slug": "slug",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${userSlug}`,
        ":slug": ClosedSession,
      },
    })
    .promise();

  const sessions = await Promise.all([
    openSessionsPromise,
    closedSessionsPromise,
  ]).then(([{ Items: openSessions = [] }, { Items: closeSessions = [] }]) => [
    ...openSessions,
    ...closeSessions,
  ]);

  await emit(
    "response",
    { sessions: sessions, type: SylarEvent.GET_SESSIONS, uid: metadata.uid },
    domainName,
    [connectionId],
    "sylar"
  );
};

const getJobSessions = async ({
  metadata,
  domainName,
  connectionId,
}: {
  metadata: Metadata;
  domainName: string;
  connectionId: string;
}) => {
  const { account_id, user_id } = metadata;
  const account = await getAccount(account_id!);
  const databaseName = account?.database_name;
  if (!databaseName) throw new Error(`Database don't exist for ${account_id}`);
  const connectionKnex = await connectKnex(databaseName);

  const jobSessions = await connectionKnex<JobSession>(
    ACCOUNT_JOB_SESSION_TABLE_NAME
  )
    .where("user_id", user_id)
    .whereIn("status", ["Open", "Awaiting Instruction"]);

  let sessionData: JobSessionData[] = [];
  if (jobSessions.length > 0) {
    const queryItem = {
      RequestItems: {
        [envTableNames.DYNAMODB_JOB_SESSION_DATA]: {
          Keys: jobSessions.map((jb) => ({
            id: `${account_id}:${ACCOUNT_JOB_SESSION_DATA_TABLE_NAME}`,
            slug: `${jb.session_id}`,
          })),
        },
      },
    };
    const { Responses } = await dynamodb.batchGet(queryItem).promise();
    sessionData = Responses?.[
      envTableNames.DYNAMODB_JOB_SESSION_DATA
    ] as unknown as JobSessionData[];
  }

  const jobSessionsWithData = jobSessions.map((jb) => {
    return {
      ...jb,
      session_data: sessionData?.find((d) => d.slug === `${jb.session_id}`),
    };
  });

  await emit(
    "response",
    {
      jobSessions: jobSessionsWithData,
      type: SylarEvent.GET_JOB_SESSIONS,
      uid: metadata.uid,
    },
    domainName,
    [connectionId],
    "sylar"
  );
};
const getMessages = async ({
  metadata,
  domainName,
  connectionId,
}: {
  metadata: Metadata;
  domainName: string;
  connectionId: string;
}) => {
  console.log("---getMessages", metadata);
  const accountId = metadata.account_id;
  const userSlug = metadata.user_id;
  const sessionSlug = metadata.event?.chat_session_id as string;

  if (!sessionSlug) throw new Error("Invalide params");

  const lastIndex = sessionSlug.lastIndexOf(":");
  const sessionId = sessionSlug.substring(lastIndex + 1);
  const { Items } = await dynamodb
    .query({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
      KeyConditionExpression: "#id = :id",
      ExpressionAttributeNames: {
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:${userSlug}:${sessionId}`,
      },
    })
    .promise();

  await emit(
    "response",
    { messages: Items, type: SylarEvent.GET_MESSAGES, uid: metadata.uid },
    domainName,
    [connectionId],
    "sylar"
  );
};
const messageHanlder = async ({
  metadata,
  domainName,
  connectionId,
}: {
  metadata: Metadata;
  domainName: string;
  connectionId: string;
}) => {
  console.log("---messageHanlder", JSON.stringify(metadata, null, 2));
  const accountId = metadata.account_id;
  const userSlug = metadata.user_id;
  const sessionSlug = metadata.event?.chat_session_id as string;
  const message = metadata.event?.message;
  const system_message = metadata.event?.system_message || "";

  const userSocketConnections = await getUserSocketConnection(userSlug!);

  if (!sessionSlug) throw new Error("Invalide params");
  const lastIndex = sessionSlug.lastIndexOf(":");
  const sessionId = sessionSlug.substring(lastIndex + 1);

  const account = await getAccount(accountId as string);

  if (!account?.slug) throw new Error("Invalide Account Id");

  const { Item } = await dynamodb
    .get({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
      Key: {
        id: `${accountId}:${userSlug}`,
        slug: sessionSlug,
      },
    })
    .promise();
  const sylarSession = Item as SylarSession;

  const clientMessageParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
    Item: {
      id: `${accountId}:${userSlug}:${sessionId}`,
      slug: `${Date.now()}:AGENT`,
      created_at: `${Date.now()}`,
      is_open: 1,
      is_agent: true,
      meta_data: {
        message: message,
      },
      is_deleted: 0,
    },
  };

  let sylarMessageParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
    Item: {
      id: `${accountId}:${userSlug}:${sessionId}`,
      slug: `${Date.now()}:SYLAR`,
      created_at: `${Date.now()}`,
      is_open: 1,
      by_sylar: true,
      chatgpt: true,
      meta_data: {
        message: "typing...",
      },
      is_deleted: 0,
    },
  };
  console.log(
    "🚀 ~ file: index.ts:511 ~ clientMessageParams:",
    clientMessageParams
  );
  await dynamodb.put(clientMessageParams).promise();

  await emit(
    "response",
    {
      message: clientMessageParams.Item,
      type: SylarEvent.MESSAGE,
      uid: metadata.uid,
    },
    domainName,
    userSocketConnections,
    "sylar"
  );

  await emit(
    SylarAction.SYLAR_MESSAGES,
    {
      isResponseComplete: false,
      message: sylarMessageParams.Item,
      type: SylarEvent.MESSAGE,
      uid: metadata.uid,
    },
    domainName,
    userSocketConnections,
    "sylar"
  ).catch((e) => {
    // handle error here
    console.error(e);
  });
  const connectionKnex = await connectKnex(account?.database_name);
  const startjobId = extractStartJobId(message!);
  const closejobId = extractCloseJobId(message!);

  if (startjobId) {
    const jobSession = await connectionKnex<JobSession>(
      ACCOUNT_JOB_SESSION_TABLE_NAME
    )
      .where("session_id", startjobId)
      .first();

    if (jobSession) {
      await updateJob({
        key: startjobId,
        knex: connectionKnex,
        data: { status: "Open" },
      });

      await emit(
        SylarAction.SYLAR_EVENT,
        {
          jobSession: { session_id: startjobId, status: "Open" },
          type: SylarEvent.JOB_SESSION_STATUS_CHANGE,
          uid: metadata.uid,
        },
        domainName,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });

      sylarMessageParams = {
        ...sylarMessageParams,
        Item: {
          ...sylarMessageParams.Item,
          by_sylar: true,
          chatgpt: true,
          meta_data: { message: "Starting the job" },
        },
      };
      await Promise.all([
        dynamodb.put(sylarMessageParams).promise(),
        emit(
          SylarAction.SYLAR_MESSAGES,
          {
            isResponseComplete: true,
            message: sylarMessageParams.Item,
            type: SylarEvent.MESSAGE,
            uid: metadata.uid,
          },
          domainName,
          userSocketConnections,
          "sylar"
        ).catch((e) => {
          // handle error here
          console.error(e);
        }),
      ]);
    } else {
      sylarMessageParams = {
        ...sylarMessageParams,
        Item: {
          ...sylarMessageParams.Item,
          by_sylar: true,
          chatgpt: true,
          meta_data: { message: "Job not found." },
        },
      };
      await Promise.all([
        await dynamodb.put(sylarMessageParams).promise(),
        await emit(
          SylarAction.SYLAR_MESSAGES,
          {
            isResponseComplete: true,
            message: sylarMessageParams.Item,
            type: SylarEvent.MESSAGE,
            uid: metadata.uid,
          },
          domainName,
          userSocketConnections,
          "sylar"
        ).catch((e) => {
          // handle error here
          console.error(e);
        }),
      ]);
    }
  } else if (closejobId) {
    const jobSession = await connectionKnex<JobSession>(
      ACCOUNT_JOB_SESSION_TABLE_NAME
    )
      .where("session_id", closejobId)
      .first();

    if (jobSession) {
      await updateJob({
        key: closejobId,
        knex: connectionKnex,
        data: { status: "Closed" },
      });

      await emit(
        SylarAction.SYLAR_EVENT,
        {
          jobSession: { session_id: closejobId, status: "Closed" },
          type: SylarEvent.JOB_SESSION_STATUS_CHANGE,
          uid: metadata.uid,
        },
        domainName,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });

      sylarMessageParams = {
        ...sylarMessageParams,
        Item: {
          ...sylarMessageParams.Item,
          by_sylar: true,
          chatgpt: true,
          meta_data: { message: "job closed" },
        },
      };
      await dynamodb.put(sylarMessageParams).promise();
      await emit(
        SylarAction.SYLAR_MESSAGES,
        {
          isResponseComplete: true,
          message: sylarMessageParams.Item,
          type: SylarEvent.MESSAGE,
          uid: metadata.uid,
        },
        domainName,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });
    } else {
      sylarMessageParams = {
        ...sylarMessageParams,
        Item: {
          ...sylarMessageParams.Item,
          by_sylar: true,
          chatgpt: true,
          meta_data: { message: "Job not found." },
        },
      };
      await Promise.all([
        await dynamodb.put(sylarMessageParams).promise(),
        await emit(
          SylarAction.SYLAR_MESSAGES,
          {
            isResponseComplete: true,
            message: sylarMessageParams.Item,
            type: SylarEvent.MESSAGE,
            uid: metadata.uid,
          },
          domainName,
          userSocketConnections,
          "sylar"
        ).catch((e) => {
          // handle error here
          console.error(e);
        }),
      ]);
    }
  } else if (sylarSession?.meta_data?.active_skill_session !== "none") {
    console.log(
      "active session found---",
      sylarSession?.meta_data?.active_skill_session
    );
    //get agent last message
    const agentlastMessage = (await getUserLastMessage(
      `${accountId}:${userSlug}:${sessionId}`
    )) as unknown as SylarSessionMessage;

    console.log("agentlastMessage", agentlastMessage);
    const actionSkillSlug = sylarSession?.meta_data?.active_skill as string;

    const getAwaitingJobs = await connectionKnex<JobSession>(
      ACCOUNT_JOB_SESSION_TABLE_NAME
    )
      .where("related_skill_id", actionSkillSlug)
      .andWhere("status", "Awaiting Instruction");

    console.log("jobs", { getAwaitingJobs, actionSkillSlug });
    const jobIds = getAwaitingJobs.map((j) => j.session_id);
    if (message?.toLocaleLowerCase() === "exit skill" && jobIds.length) {
      sylarMessageParams = {
        ...sylarMessageParams,
        Item: {
          ...sylarMessageParams.Item,
          by_sylar: true,
          chatgpt: true,
          meta_data: { message: "Do you want to cancel Task Title" },
        },
      };

      await Promise.all([
        emit(
          SylarAction.SYLAR_MESSAGES,
          {
            isResponseComplete: true,
            message: sylarMessageParams.Item,
            type: SylarEvent.MESSAGE,
            uid: metadata.uid,
          },
          domainName,
          userSocketConnections,
          "sylar"
        ).catch((e) => {
          // handle error here
          console.error(e);
        }),
        dynamodb.put(sylarMessageParams).promise(),
      ]);
    } else if (
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      agentlastMessage?.meta_data?.message?.toLocaleLowerCase() ===
        "exit skill" &&
      message?.toLocaleLowerCase() === "no"
    ) {
      sylarMessageParams = {
        ...sylarMessageParams,
        Item: {
          ...sylarMessageParams.Item,
          by_sylar: true,
          chatgpt: true,
          meta_data: { message: "Ok , keeping this skill open" },
        },
      };

      await Promise.all([
        emit(
          SylarAction.SYLAR_MESSAGES,
          {
            isResponseComplete: true,
            message: sylarMessageParams.Item,
            type: SylarEvent.MESSAGE,
            uid: metadata.uid,
          },
          domainName,
          userSocketConnections,
          "sylar"
        ).catch((e) => {
          // handle error here
          console.error(e);
        }),
        dynamodb.put(sylarMessageParams).promise(),
      ]);
    } else if (
      //if active session then wait for yes, if no active session close the skill
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (agentlastMessage?.meta_data?.message?.toLocaleLowerCase() ===
        "exit skill" &&
        message?.toLocaleLowerCase() === "yes" &&
        jobIds.length) ||
      (message?.toLocaleLowerCase() === "exit skill" && !jobIds.length)
    ) {
      //Close Session

      sylarMessageParams = {
        ...sylarMessageParams,
        Item: {
          ...sylarMessageParams.Item,
          by_sylar: true,
          chatgpt: true,
          meta_data: { message: "Stoping the skill" },
        },
      };

      await emit(
        SylarAction.SYLAR_MESSAGES,
        {
          isResponseComplete: true,
          message: sylarMessageParams.Item,
          type: SylarEvent.MESSAGE,
          uid: metadata.uid,
        },
        domainName,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });

      await Promise.all([
        connectionKnex<SkillSession>(ACCOUNT_SKILL_SESSION_TABLE_NAME)
          .update({
            end_date_time: new Date(),
            status: "Closed",
            note: "session closed by command end skill",
          })
          .where(
            "session_id",
            sylarSession.meta_data.active_skill_session as number
          ),
        connectionKnex<JobSession>(ACCOUNT_JOB_SESSION_TABLE_NAME)
          .update({ status: "Cancelled" })
          .where("related_skill_id", actionSkillSlug)
          .andWhere("status", "Awaiting Instruction"),
        dynamodb.put(sylarMessageParams).promise(),
        dynamodb
          .update({
            TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
            Key: {
              id: sylarSession.id,
              slug: sylarSession.slug,
            },
            UpdateExpression:
              "SET #metadata.#activeSkill = :activeSkill, #metadata.#activeSkillSession = :activeSkillSession",
            ExpressionAttributeNames: {
              "#metadata": "meta_data",
              "#activeSkill": "active_skill",
              "#activeSkillSession": "active_skill_session",
            },
            ExpressionAttributeValues: {
              ":activeSkill": "none",
              ":activeSkillSession": "none",
            },
          })
          .promise(),
      ]);
      //End Close Session
    } else {
      const { Items: previousMessages } = await dynamodb
        .query({
          TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
          KeyConditionExpression: "#id = :id",
          ExpressionAttributeNames: {
            "#id": "id",
          },
          ExpressionAttributeValues: {
            ":id": `${accountId}:${userSlug}:${sessionId}`,
          },
        })
        .promise();

      let completeResponse = "";

      const messages = (previousMessages as SylarSessionMessage[]).map(
        (message) => {
          if (message.chatgpt) {
            return { role: "assistant", content: message.meta_data.message };
          }
          return { role: "user", content: message.meta_data.message };
        }
      );
      const conversation = [
        ...messages,
        { role: "user", content: message! },
      ] as Message[];
      const requestPayload: OpenAIChatRequest = {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: system_message },
          ...conversation,
        ],
        temperature: 1,
      };

      const responseData = await axios
        .post<OpenAIChatResponse>(
          "https://api.openai.com/v1/chat/completions",
          requestPayload,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        )
        .then((response: AxiosResponse<OpenAIChatResponse>) => {
          const responseData: OpenAIChatResponse = response.data;
          // Access response data using responseData object
          console.log(responseData.choices[0].message.content);
          return responseData;
        });
      completeResponse = responseData.choices[0].message.content;

      sylarMessageParams = {
        ...sylarMessageParams,
        Item: {
          ...sylarMessageParams.Item,
          meta_data: { message: completeResponse },
        },
      };

      await emit(
        SylarAction.SYLAR_MESSAGES,
        {
          isResponseComplete: true,
          message: sylarMessageParams.Item,
          type: SylarEvent.MESSAGE,
          uid: metadata.uid,
        },
        domainName,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });

      console.log("---adding in dynamo", sylarMessageParams);
      await Promise.all([
        dynamodb.put(sylarMessageParams).promise(),
        // dynamodb
        //   .update(
        //     buildUpdateExpression({
        //       keys: {
        //         id: `${accountId}${ACCOUNT_SKILL_SESSION_DATA_TABLE_NAME}`,
        //         slug: sylarSession.meta_data.active_skill_session!,
        //       },
        //       tableName: envTableNames.DYNAMODB_SKILL_SESSION_DATA,
        //       item: sylarSession
        //     })
        //   )
        //   .promise(),
      ]);
    }
  } else {
    try {
      await handleSkillDetection({
        accountSlug: accountId!,
        userSlug: userSlug!,
        sessionSlug,
        sessionId,
        message: message || "",
        uid: metadata.uid,
        databaseName: account.database_name,
        userSocketConnections,
      });
    } catch (e) {
      const sylarSessionMessage = await createSessionMessage({
        accountSlug: accountId!,
        userSlug: userSlug!,
        sessionSlug: sessionId,
        message: "Sorry, I am not able to complete your request.",
        messageType: "SYLAR",
      });
      console.log(
        "🚀 ~ file: handleSkillDetection.ts:284 ~ sylarSessionMessage:",
        JSON.stringify(sylarSessionMessage, null, 2)
      );

      await emit(
        SylarAction.SYLAR_MESSAGES,
        {
          isResponseComplete: true,
          message: sylarSessionMessage,
          type: SylarEvent.MESSAGE,
          uid: metadata.uid,
        },
        `${WEBSOCKET_URL}`,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });

      throw e;
    }
  }
};

const closeSession = async ({
  metadata,
  domainName,
  connectionId,
}: {
  metadata: Metadata;
  domainName: string;
  connectionId: string;
}) => {
  console.log("---closeSession", metadata);
  const accountId = metadata.account_id;
  const userSlug = metadata.user_id;
  const sessionSlug = metadata.event?.chat_session_id as string;
  const userSocketConnections = await getUserSocketConnection(userSlug!);
  const { Item } = await dynamodb
    .get({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
      Key: {
        id: `${accountId}:${userSlug}`,
        slug: sessionSlug,
      },
    })
    .promise();
  const openSession = Item as SylarSession;

  if (!openSession) throw new Error("doesn't doesn't exit");

  await dynamodb
    .delete({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
      Key: {
        id: `${accountId}:${userSlug}`,
        slug: sessionSlug,
      },
    })
    .promise();

  const sylarCloseSessionParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
    Item: {
      ...openSession,
      slug: openSession.slug.replace("ISOPEN", "ISCLOSED"),
    },
  };

  await dynamodb.put(sylarCloseSessionParams).promise();

  await emit(
    "response",
    {
      session: sylarCloseSessionParams.Item,
      type: SylarEvent.CLOSE_SESSION,
      uid: metadata.uid,
    },
    domainName,
    userSocketConnections,
    "sylar"
  );
};

type HandleAsQuestionResponseParams = {
  metadata: {
    user_id: string;
    event: {
      chat_session_id: string;
      message: string;
      sessionData: {
        sessionSlug: string;
        accountId: string;
        operatorSlug: string;
        operationIdx: number;
        queueItemSlug: string;
        queueBranchId?: string;
      };
    };
    uid: string;
  };
  domainName: string;
  connectionId: string;
};

const handleAskQuestionResponse = async (
  params: HandleAsQuestionResponseParams
) => {
  const { metadata } = params;
  console.log(
    "🚀 ~ file: sylar.ts:1205 ~ params:",
    JSON.stringify(params, null, 2)
  );

  const { message, sessionData, chat_session_id } = metadata.event;

  const clientMessageParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
    Item: {
      id: `${sessionData.accountId}:${metadata.user_id}:${chat_session_id
        ?.split(":")
        .pop()}`,
      slug: `${Date.now()}:USER`,
      created_at: `${Date.now()}`,
      is_open: 1,
      is_agent: false,
      meta_data: {
        message,
      },
      is_deleted: 0,
    },
  };

  await dynamodb.put(clientMessageParams).promise();

  const userSocketConnections = await getUserSocketConnection(metadata.user_id);

  await emit(
    "response",
    {
      type: SylarEvent.MESSAGE,
      isResponseComplete: true,
      message: clientMessageParams.Item,
      uid: metadata.uid,
    },
    `${WEBSOCKET_URL}`,
    userSocketConnections,
    "sylar"
  ).catch((e) => {
    // handle error here
    console.error(e);
  });

  const s3Path = `${sessionData.accountId}/fusion-sessions/${sessionData.sessionSlug}/${sessionData.operatorSlug}/${sessionData.operationIdx}.json`;

  const s3 = await getS3Client();

  const { Body } = await s3
    .getObject({
      Bucket: MEDIA_BUCKET_NAME!,
      Key: s3Path,
    })
    .promise();

  const data = JSON.parse(Body?.toString("utf-8") || "{}") as {
    outputs: unknown;
  };

  data.outputs = {
    user_input: message,
  };

  await uploadSessionOperationToS3(s3Path, data);

  const { Attributes } = await updateSession(
    sessionData.accountId,
    sessionData.sessionSlug,
    "SET #isPaused = :isPaused",
    {
      ":isPaused": false,
    },
    {
      "#isPaused": "is_paused",
    }
  );

  const session = Attributes as FusionSession;
  const nextQueueItem = await getNextQueueItem(
    sessionData.sessionSlug,
    sessionData.queueBranchId
  );
  if (nextQueueItem) {
    await triggerQueueItem(
      nextQueueItem,
      sessionData.accountId,
      session.session_data,
      sessionData.sessionSlug,
      {
        [sessionData.operatorSlug]: data.outputs,
      },
      sessionData.queueItemSlug
    );
  }
};

const processSylarAction = async (
  body: string,
  connId: string,
  domainName: string
  // eslint-disable-next-line @typescript-eslint/require-await
) => {
  console.log("in-processSylarAction: ", body);

  const data = JSON.parse(body);
  const metadata: Metadata = data.metadata;

  const { user_id, account_id, event } = metadata;

  switch (event?.event_type) {
    case SylarEvent.INITIALIZE:
      await initailizeChat({ metadata, connectionId: connId, domainName });
      break;
    case SylarEvent.GET_SESSIONS:
      await getSessions({ metadata, connectionId: connId, domainName });
      break;
    case SylarEvent.GET_MESSAGES:
      await getMessages({ metadata, connectionId: connId, domainName });
      break;
    case SylarEvent.MESSAGE:
      await messageHanlder({ metadata, connectionId: connId, domainName });
      break;
    case SylarEvent.CLOSE_SESSION:
      await closeSession({ metadata, connectionId: connId, domainName });
      break;
    case SylarEvent.GET_JOB_SESSIONS:
      await getJobSessions({ metadata, connectionId: connId, domainName });
      break;
    case SylarEvent.ASK_QUESTION_RESPONSE:
      await handleAskQuestionResponse({
        metadata: data.metadata,
        connectionId: connId,
        domainName,
      });
      break;
    default:
      console.log("sylar default");
      return;
  }
};
export default processSylarAction;
