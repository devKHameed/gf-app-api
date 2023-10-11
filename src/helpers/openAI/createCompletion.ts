import axios from "axios";
import { OPEN_AI_API_KEY } from "../../config";
import {
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
} from "../../types/OpenAI";

export const createChatCompletion = async (
  data: CreateChatCompletionRequest
) => {
  console.log(
    "🚀 ~ file: createCompletion.ts:11 ~ data:",
    JSON.stringify(data)
  );
  console.log(
    "🚀 ~ file: createCompletion.ts:22 ~ OPEN_AI_API_KEY:",
    OPEN_AI_API_KEY
  );
  const res = await axios
    .post<CreateChatCompletionResponse>(
      "https://api.openai.com/v1/chat/completions",
      data,
      {
        headers: {
          Authorization: `Bearer ${OPEN_AI_API_KEY}`,
        },
      }
    )
    .catch((err) => {
      console.log({ responseData: JSON.stringify(err.response.data, null, 2) });
      throw err;
    });

  console.log({ responseData: JSON.stringify(res.data, null, 2) });

  return res.data;
};
