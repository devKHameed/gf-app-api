import { DocumentElementType } from "../../../constants/dataset";
import { Fusion } from "../../../types";
import { ChatCompletionFunctions } from "../../../types/OpenAI";

export const createGPTFunctionListFromFusions = (fusions: Fusion[]) => {
  return fusions.map((f) => {
    return createGPTFunction(f);
  });
};

const createGPTFunction = (fusion: Fusion): ChatCompletionFunctions => {
  const activeFields =
    fusion.fusion_fields?.fields?.filter((f) => f.is_active) || [];

  return {
    name: fusion.fusion_slug || "",
    description: fusion.skill_description || "",
    parameters: {
      type: "object",
      properties: activeFields.reduce<Record<string, any>>((acc, cur) => {
        acc[cur.slug] = {
          type: "string",
          description: cur.description || "",
        };

        if (cur.type === DocumentElementType.Select) {
          acc[cur.slug].enum = cur.list_items?.map((o) => o.value as string);
        }

        return acc;
      }, {}),
      // required:
      //   activeFields?.filter((f) => f.is_required).map((f) => f.slug) || [],
    },
  };
};
