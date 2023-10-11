import { isArray, isBoolean, isDate, isNumber, isPlainObject } from "lodash";
import { DocumentElementType } from "../../constants/dataset";
import { formatValue } from "./generateInsertSql";

async function generateUpdateSql(
  tableName: string,
  data: { [key: string]: any },
  fields: { slug: string; type: `${DocumentElementType}` }[],
  condition: string,
  accountId?: string,
  fixedFields?: Record<string, string>
) {
  const fieldMap: { [key: string]: any } = {};
  fields.forEach((field) => (fieldMap[field.slug] = field.type));

  const setData: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    const fieldType = fieldMap[key] as `${DocumentElementType}`;
    const formattedValue = await formatValue(value, fieldType, accountId);
    if (formattedValue !== "''" && formattedValue !== "") {
      setData.push(`\`${key}\` = ${formattedValue}`);
    }
  }

  Object.entries(fixedFields || {})?.forEach(([key, value]) => {
    if (!value) {
      return;
    }
    if (isNumber(value)) {
      setData.push(`\`${key}\` = ${value}`);
    } else if (isBoolean(value)) {
      setData.push(`\`${key}\` = ${value === true ? 1 : 0}`);
    } else if (isPlainObject(value) || isArray(value)) {
      setData.push(`\`${key}\` = ${JSON.stringify(value)}`);
    } else if (isDate(value)) {
      setData.push(`\`${key}\` = '${value.toISOString()}'`);
    } else {
      setData.push(`\`${key}\` = '${value}'`);
    }
  });

  const sql = `UPDATE ${tableName} SET ${setData.join(
    ", "
  )} WHERE ${condition};`;
  return sql;
}
export default generateUpdateSql;
