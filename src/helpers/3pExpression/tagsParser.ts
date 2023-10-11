import _ from "lodash";

type CallStack = {
  type: string;
  value: string;
};

type Tag = {
  type: string;
  slug: string;
};

// ('[[{"value":"get (","id":"91d41d4a-ae02-49db-8ef1-5c6cf88e44ce","slug":"get","color":"#ABB5C0","draggable":true,"type":"function"}]][[{"value":"Results[","id":"034bfead-42c3-44aa-9666-de612782b804","slug":"specify_a_character_for_conversation__6ed84b03-4bdd-4855-99d2-93ea7953cb50.results[","color":"rgb(168, 124, 20)","draggable":true,"type":"variable"}]]0[[{"value":"]history.visible","id":"a8644c94-3116-4fc9-8d0c-0d3655c36fe1","slug":"].history.visible","color":"rgb(168, 124, 20)","draggable":true,"type":"variable"}]],"[0][1]"[[{"value":")","id":"d971d865-e994-40e1-bc1c-39dfe06bcf01","slug":"get","color":"#ABB5C0","type":"closing_bracket"}]]');

export const parseTags = (value = "") => {
  const chunks = value.split(/\[\[|\]\]/).filter((v) => !!v.trim());
  // console.log("🚀 ~ file: tagsParser.ts:17 ~ parseTags ~ chunks:", JSON.stringify(chunks, null, 2));

  let finalStr = "";

  const { refinedChunks } = chunks.reduce(
    (acc, cur) => {
      const tag = getIfTag(cur);

      if (acc.type === "function") {
        if (!tag) {
          acc.chunks.push(cur);
        } else {
          acc.chunks.push(cur);
          if (tag.type === "closing_bracket") {
            const funcTag = getIfTag(acc.chunks[0]);
            if (funcTag != null && tag.slug === funcTag.slug) {
              acc.refinedChunks.push(acc.chunks);
              acc.type = undefined;
              acc.chunks = [];
            }
          }
        }

        return acc;
      }

      if (acc.type === "variable") {
        if (!tag) {
          acc.chunks.push(cur);
        } else {
          acc.chunks.push(cur);
          if (
            tag.type === "variable" &&
            tag.slug.startsWith("]") &&
            !tag.slug.endsWith("[")
          ) {
            acc.refinedChunks.push(acc.chunks);
            acc.type = undefined;
            acc.chunks = [];
          }
        }

        return acc;
      }

      if (tag == null) {
        acc.refinedChunks.push(cur);
        acc.type = undefined;
        acc.chunks = [];
      } else if (tag.type === "function") {
        acc.type = "function";
        acc.chunks.push(cur);
      } else if (tag.type === "variable") {
        if (tag.slug.endsWith("[")) {
          acc.type = "variable";
          acc.chunks.push(cur);
        } else {
          acc.refinedChunks.push([cur]);
          acc.type = undefined;
          acc.chunks = [];
        }
      }

      return acc;
    },
    { chunks: [], refinedChunks: [] } as {
      type?: string;
      chunks: string[];
      refinedChunks: (string | string[])[];
    }
  );
  // console.log("🚀 ~ file: tagsParser.ts:88 ~ parseTags ~ refinedChunks:", JSON.stringify(refinedChunks, null, 2));

  for (const chunk of refinedChunks) {
    if (typeof chunk === "string") {
      finalStr += chunk;
    } else {
      // console.log({ expr: getExpressionStr(chunk), chunk });
      finalStr += `{{${getExpressionStr(chunk)}}}`;
    }
  }

  return finalStr;
};

const getExpressionStr = (chunks: string[]): string => {
  let finalStr = "";
  for (const chunk of chunks) {
    const tag = getIfTag(chunk);

    if (tag == null) {
      finalStr += chunk;
      //   console.log({ finalStr });
      continue;
    }

    const tagType = tag.type;
    const tagSlug = tag.slug;

    switch (tagType) {
      case "function":
        finalStr += `${tagSlug}(`;
        break;
      case "closing_bracket":
        finalStr += ")";
        break;
      case "variable": {
        let variablesStr = tagSlug,
          prependStr = "body",
          postpendStr = "";
        if (tagSlug.endsWith("[")) {
          variablesStr = variablesStr.slice(0, -1);
          postpendStr = "[";
        }
        if (tagSlug.startsWith("]")) {
          variablesStr = variablesStr.slice(1);
          prependStr = "]";
        }

        const variableMaps = variablesStr
          .split(".")
          .filter(Boolean)
          .map((v) => `["${v}"]`)
          .join("");
        finalStr += `${prependStr}${variableMaps}${postpendStr}`;
      }
    }
    // console.log({ finalStr });
  }

  return finalStr;
};

export const getIfTag = (str: string) => {
  try {
    const tagObject = JSON.parse(str);
    if (_.isObject(tagObject)) {
      const tag = tagObject as Tag;
      return tag.type && tag.slug ? tag : null;
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const parseTagsToExpression = (value: string) => {
  return parseTags(value);
};
