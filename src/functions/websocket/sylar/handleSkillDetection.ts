import { SylarAction, SylarEvent } from ".";
import { WEBSOCKET_URL, envTableNames } from "../../../config";
import { FusionLambda } from "../../../constants/3pApp";
import { FusionType } from "../../../enums/fusion";
import { InvocationType } from "../../../enums/lambda";
import { dynamodb } from "../../../helpers/db";
import connectKnex from "../../../helpers/knex/connect";
import { invokeLambda } from "../../../helpers/lambda";
import { createChatCompletion } from "../../../helpers/openAI/createCompletion";
import createSkill from "../../../helpers/skills/createSkill";
import { Fusion } from "../../../types";
import {
  ChatCompletionRequestMessage,
  ChatCompletionResponseMessage,
} from "../../../types/OpenAI";
import { getUserSocketConnection } from "../helper";
import { emit } from "../util";
import { createGPTFunctionListFromFusions } from "./createGPTFunctionsListFromFusions";
import { createSessionMessage, getSessionMessages } from "./sessionMessages";

type HandleSkillDetectionParams = {
  accountSlug: string;
  userSlug: string;
  sessionSlug: string;
  message: string;
  uid: string;
  databaseName: string;
  userSocketConnections?: string[];
  sessionId: string;
};

export const handleSkillDetection = async (
  params: HandleSkillDetectionParams
) => {
  console.log(
    "🚀 ~ file: handleSkillDetection.ts:35 ~ params:",
    JSON.stringify(params, null, 2)
  );
  const {
    accountSlug,
    userSlug,
    sessionSlug,
    message,
    uid,
    userSocketConnections = [],
    databaseName,
    sessionId,
  } = params;

  const fusionRes = await dynamodb.query({
    TableName: envTableNames.DYNAMODB_ACCT_FUSIONS,
    IndexName: "fusion_type_gsi",
    KeyConditionExpression: "#id = :id AND #type = :type",
    FilterExpression: "#isActive = :isActive",
    ExpressionAttributeNames: {
      "#id": "id",
      "#type": "fusion_type",
      "#isActive": "is_active",
    },
    ExpressionAttributeValues: {
      ":id": `${accountSlug}:fusions`,
      ":type": FusionType.Skills,
      ":isActive": true,
    },
  });

  const skillFusions = fusionRes.Items as Fusion[];
  console.log(
    "🚀 ~ file: handleSkillDetection.ts:65 ~ skillFusions:",
    JSON.stringify(skillFusions, null, 2)
  );

  const gptFunctions = createGPTFunctionListFromFusions(skillFusions);
  console.log(
    "🚀 ~ file: handleSkillDetection.ts:74 ~ gptFunctions:",
    JSON.stringify(gptFunctions, null, 2)
  );

  const sessionMessages = await getSessionMessages({
    accountSlug,
    userSlug,
    sessionSlug: sessionId,
  });
  console.log(
    "🚀 ~ file: handleSkillDetection.ts:84 ~ sessionMessages:",
    JSON.stringify(sessionMessages, null, 2)
  );

  const messages = sessionMessages.map<ChatCompletionRequestMessage>(
    (message) => {
      if (message.chatgpt) {
        return { role: "assistant", content: message.meta_data.message };
      }
      return { role: "user", content: message.meta_data.message };
    }
  );

  messages.unshift({
    role: "system",
    content:
      "Don't make assumptions about what values to plug into functions. Ask for clarification if a user request is ambiguous. Never assume any of the function arguments always ask for the argument value.",
  });

  // messages.push({ role: "user", content: message });
  console.log(
    "🚀 ~ file: handleSkillDetection.ts:94 ~ messages:",
    JSON.stringify(messages, null, 2)
  );

  const completionResponse = await createChatCompletion({
    model: "gpt-3.5-turbo-0613",
    messages,
    functions: gptFunctions,
    function_call: "auto",
  });
  console.log(
    "🚀 ~ file: handleSkillDetection.ts:113 ~ completionResponse:",
    JSON.stringify(completionResponse, null, 2)
  );

  const responseMessage = completionResponse.choices[0].message;

  const socketConnections =
    userSocketConnections ?? (await getUserSocketConnection(userSlug));

  if (responseMessage?.function_call) {
    messages.push({
      role: "system",
      content:
        "Are you sure the user explicitly stated the value of each of these slots? Can you please check your work. If the user did not explicitly give you all of these values, will you please request any missing values? Give me one word answer yes or no",
    });
    await createChatCompletion({
      model: "gpt-3.5-turbo-0613",
      messages,
      functions: gptFunctions,
      function_call: "auto",
    });
    await handleFunctionCallResponse({
      responseMessage,
      socketConnections,
      uid,
      databaseName,
      skillFusions,
      sessionId,
      userSlug,
      accountSlug,
      sessionSlug,
    });

    return;
  }
  const sylarSessionMessage = await createSessionMessage({
    accountSlug,
    userSlug,
    sessionSlug: sessionId,
    message: responseMessage?.content || "",
    messageType: "SYLAR",
  });
  console.log(
    "🚀 ~ file: handleSkillDetection.ts:148 ~ sylarSessionMessage:",
    JSON.stringify(sylarSessionMessage, null, 2)
  );

  await emit(
    SylarAction.SYLAR_MESSAGES,
    {
      isResponseComplete: true,
      message: sylarSessionMessage,
      type: SylarEvent.MESSAGE,
      uid,
    },
    WEBSOCKET_URL,
    socketConnections,
    "sylar"
  ).catch((e) => {
    // handle error here
    console.error(e);
  });
};

type HandleFunctionCallResponseParams = {
  responseMessage: ChatCompletionResponseMessage;
  skillFusions: Fusion[];
  databaseName: string;
  userSlug: string;
  accountSlug: string;
  sessionSlug: string;
  sessionId: string;
  uid: string;
  socketConnections: string[];
};

const handleFunctionCallResponse = async (
  params: HandleFunctionCallResponseParams
) => {
  const {
    responseMessage,
    skillFusions,
    databaseName,
    userSlug,
    accountSlug,
    sessionSlug,
    sessionId,
    uid,
    socketConnections,
  } = params;
  console.log(
    "🚀 ~ file: handleSkillDetection.ts:196 ~ params:",
    JSON.stringify(params, null, 2)
  );

  const fusionSlug = responseMessage?.function_call?.name;
  const fusionArgs = JSON.parse(
    responseMessage?.function_call?.arguments || "{}"
  );
  const fusion = skillFusions.find((f) => f.fusion_slug === fusionSlug);
  if (fusionSlug && fusion) {
    // Start Skill Session
    const connectionKnex = await connectKnex(databaseName);

    const [skillSessionId] = await createSkill({
      knex: connectionKnex,
      userId: userSlug,
      accountId: accountSlug,
      skillId: fusionSlug,
    });
    console.log(
      "🚀 ~ file: handleSkillDetection.ts:213 ~ skillSessionId:",
      skillSessionId
    );

    await invokeLambda(
      FusionLambda.SessionInt,
      {
        fusionSlug: fusionSlug,
        popupVariables: {
          popup_variables: {
            skill_id: fusionSlug,
            skill_session_id: skillSessionId,
            chat_session_id: sessionSlug,
          },
        },
        sessionInitVars: fusionArgs,
        userId: userSlug,
        fusion, // this is the full fusion object
        accountId: accountSlug,
      },
      InvocationType.Event,
      { roundRobin: true }
    );
    //Start Sylar Session Update
    await dynamodb.update(
      {
        TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
        Key: {
          id: `${accountSlug}:${userSlug}`,
          slug: sessionSlug,
        },
        UpdateExpression:
          "SET #metadata.#activeSkill = :activeSkill, #metadata.#activeSkillSession = :activeSkillSession",
        ExpressionAttributeNames: {
          "#metadata": "meta_data",
          "#activeSkill": "active_skill",
          "#activeSkillSession": "active_skill_session",
        },
        ExpressionAttributeValues: {
          ":activeSkill": fusionSlug,
          ":activeSkillSession": skillSessionId,
        },
      },
      2
    );
    //End Sylar Session Update

    const sylarSessionMessage = await createSessionMessage({
      accountSlug,
      userSlug,
      sessionSlug: sessionId,
      message: `Starting ${fusion?.fusion_title}`,
      messageType: "SYLAR",
    });
    console.log(
      "🚀 ~ file: handleSkillDetection.ts:267 ~ sylarSessionMessage:",
      JSON.stringify(sylarSessionMessage, null, 2)
    );

    await emit(
      SylarAction.SYLAR_MESSAGES,
      {
        isResponseComplete: true,
        message: sylarSessionMessage,
        type: SylarEvent.MESSAGE,
        uid,
      },
      WEBSOCKET_URL,
      socketConnections,
      "sylar"
    ).catch((e) => {
      // handle error here
      console.error(e);
    });
  } else {
    const sylarSessionMessage = await createSessionMessage({
      accountSlug,
      userSlug,
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
        uid,
      },
      WEBSOCKET_URL,
      socketConnections,
      "sylar"
    ).catch((e) => {
      // handle error here
      console.error(e);
    });
  }
};
