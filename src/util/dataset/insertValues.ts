import { Knex } from "knex";
import { isArray } from "lodash";
import { DocumentElementType } from "../../constants/dataset";

function insertValues({
  knex,
  tableName,
  dynamicData: data = {},
  staticData = {},
  fields,
}: {
  knex: Knex;
  tableName: string;
  dynamicData: { [key: string]: any };
  staticData: { [key: string]: any };
  fields: { slug: string; type: `${DocumentElementType}` }[];
}): Knex.QueryBuilder<any, number[]> {
  const fieldMap: { [key: string]: any } = {};
  fields.forEach((field) => (fieldMap[field.slug] = field.type));

  const formattedData = Object.entries(data).reduce((acc, [key, value]) => {
    const fieldType = fieldMap[key] as `${DocumentElementType}`;
    acc[key] = formatValue(value as unknown, fieldType);
    return acc;
  }, {} as { [key: string]: any });

  const query = knex<typeof staticData & typeof data>(tableName).insert({
    ...formattedData,
    ...staticData,
  });
  return query;
}

export function formatValue(
  value: unknown,
  fieldType: `${DocumentElementType}`
): string | number {
  if (fieldType === "date" && value instanceof Date) {
    return value.toISOString().split("T")[0];
  } else if (fieldType === "select" && isArray(value)) {
    return JSON.stringify(value);
  } else if (
    [
      "user-select",
      "image",
      "file",
      "video",
      "location",
      "sub-record",
      "record-list",
      "audio_video",
      "checkbox"
    ].includes(fieldType)
  ) {
    return JSON.stringify(value);
  } else {
    return value as number | string;
  }
}

export default insertValues;
