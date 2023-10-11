import { DocumentElementType } from "../../constants/dataset";

function generateSqlTable(
  tableName: string,
  primaryKey: string,
  fields: { slug: string; type: `${DocumentElementType}` }[] = [],
  ifNotExists = false
) {
  let sql = `CREATE TABLE ${
    ifNotExists ? "IF NOT EXISTS" : ""
  } ${tableName} (\n`;

  for (const field of fields.filter((f) => f.slug !== primaryKey)) {
    const fieldType = field.type;
    const fieldName = field.slug;

    if (fieldName && fieldType) {
      sql += `  \`${fieldName}\` ${getColumnType(fieldType)},\n`;
    }
  }
  sql += `  \`${primaryKey}\` VARCHAR(100) PRIMARY KEY,\n`;
  sql = sql.slice(0, -2) + "\n);";
  return sql;
}

export function getColumnType(type: `${DocumentElementType}`) {
  switch (type) {
    case "text-field":
    case "select":
    case "label":
      return "VARCHAR(255)";
    case "textarea":
      return "TEXT";
    case "date":
      return "DATE";
    case "input-number":
      return "INT";
    case "boolean":
      return "BOOLEAN";
    case "code-editor":
    case "record-list":
    case "image":
    case "file":
    case "audio_video":
      return "JSON";
    default:
      return "VARCHAR(255)";
  }
}
export default generateSqlTable;
