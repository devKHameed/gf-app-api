import { Knex } from "knex";
import { DocumentElementType } from "../../constants/dataset";
import { formatValue } from "./insertValues";

async function updateValue({
  knex,
  tableName,
  dynamicData: data = {},
  staticData = {},
  fields,
  where,
}: {
  knex: Knex;
  tableName: string;
  dynamicData: { [key: string]: any };
  staticData: { [key: string]: any };
  fields: { slug: string; type: `${DocumentElementType}` }[];
  where: { [key: string]: any };
}) {
  const fieldMap: { [key: string]: any } = {};
  fields.forEach((field) => (fieldMap[field.slug] = field.type));

  const formattedData = Object.entries(data).reduce((acc, [key, value]) => {
    const fieldType = fieldMap[key] as `${DocumentElementType}`;
    acc[key] = formatValue(value as unknown, fieldType);
    return acc;
  }, {} as { [key: string]: any });

  return knex(tableName)
    .update({ ...formattedData, ...staticData })
    .where(where);
}

export default updateValue;
