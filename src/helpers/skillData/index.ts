import createHttpError from "http-errors";
import { Connection } from "mysql2/promise";
import { DataField } from "types/Dataset";
import { DocumentElementType } from "../../constants/dataset";
import generateSqlTable, {
  getColumnType,
} from "../../util/dataset/generateSqlTable";

type GetSkillDataTableNameParams = {
  skillDesignSlug: string;
  type: string;
  tableSlug: string;
  sidebarSlug: string;
};

export const getSkillDataTableName = (
  params: Partial<GetSkillDataTableNameParams>
) => {
  console.log("🚀 ~ file: index.ts:17 ~ params:", params);
  const { skillDesignSlug, type } = params;
  if (type !== "table" && type !== "sidebar") {
    console.log("Invalid type");
    throw createHttpError(400, "Invalid type");
  }

  if (!skillDesignSlug) {
    console.log("Invalid skill_design_slug");
    throw createHttpError(400, "Invalid skill_design_slug");
  }

  if (!params.tableSlug) {
    console.log("Invalid table_slug");
    throw createHttpError(400, "Invalid table_slug");
  }

  if (type === "sidebar" && !params.sidebarSlug) {
    console.log("Invalid sidebar_slug");
    throw createHttpError(400, "Invalid sidebar_slug");
  }

  let tableName = "";
  if (type === "table") {
    tableName = `${skillDesignSlug}_${params.tableSlug}`;
  } else if (type === "sidebar") {
    tableName = `${skillDesignSlug}_${params.sidebarSlug}`;
  }

  return "`" + tableName + "`";
};

export const getSkillRecordIdKey = (tableName: string) => {
  const [_, ...keyChunks] = tableName.split("_");
  console.log("🚀 ~ file: index.ts:55 ~ keyChunks:", keyChunks);
  const idKey = [...keyChunks, "id"].join("_");
  return idKey;
};

export const healTable = async (
  connection: Connection,
  tableName: string,
  fields: DataField[]
) => {
  console.log("🚀 ~ file: index.ts:54 ~ fields:", fields);
  const idKey = getSkillRecordIdKey(tableName.slice(1, -1));
  console.log("🚀 ~ file: index.ts:63 ~ idKey:", idKey);
  const createSql = generateSqlTable(
    tableName,
    idKey,
    (fields as { slug: string; type: any }[]).filter((f) => f.slug !== idKey),
    true
  );
  console.log("🚀 ~ file: index.ts:61 ~ createSql:", createSql);

  const createRes = await connection.execute(createSql);
  console.log("🚀 ~ file: index.ts:64 ~ createRes:", createRes);

  const describeSql = `DESCRIBE ${tableName}`;

  console.log("🚀 ~ file: index.ts:67 ~ describeSql:", describeSql);
  const [tableData] = await connection.execute(describeSql);
  console.log(
    "🚀 ~ file: index.ts:69 ~ tableData:",
    JSON.stringify(tableData, null, 2)
  );

  for (const field of fields) {
    if (
      (tableData as { Field: string }[]).find((t) => field.slug === t.Field)
    ) {
      continue;
    }

    const alterSql = `ALTER TABLE ${tableName} ADD COLUMN \`${
      field.slug
    }\` ${getColumnType(field.type as DocumentElementType)};
    `;
    console.log("🚀 ~ file: index.ts:85 ~ alterSql:", alterSql);

    await connection.execute(alterSql);
  }
};
