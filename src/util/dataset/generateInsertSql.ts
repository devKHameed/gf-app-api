import axios from "axios";
import { isArray, isEmpty, isPlainObject, isString } from "lodash";
import { DataField } from "types/Dataset";
import { v4 } from "uuid";
import { MEDIA_BUCKET_NAME, S3_URL } from "../../config";
import { DocumentElementType } from "../../constants/dataset";
import { getS3Client } from "../../helpers/fusion";
import { isValidUrl } from "../../util/index";

async function generateInsertSql(
  tableName: string,
  data: { [key: string]: any },
  fields: { slug: string; type: `${DocumentElementType}` }[],
  fixedFields: Record<string, string> = {},
  accountId?: string
) {
  console.log({ tableName, data, fields });

  const fixedColValues = Object.entries(fixedFields).reduce<{
    columns: string[];
    values: string[];
  }>(
    (acc, [k, v]) => {
      acc.columns.push(`\`${k}\``);
      acc.values.push(`'${v.trim().replace(/'/g, "''")}'`);
      return acc;
    },
    { columns: [], values: [] }
  );

  const columns: string[] = fixedColValues.columns;
  const values: string[] = fixedColValues.values;

  for (const cur of fields) {
    columns.push(`\`${cur.slug}\``);
    let value = (await formatValue(
      data[`${cur.slug}`],
      cur.type,
      accountId,
      cur as DataField
    )) as string;
    if (value === "" || value === "''") {
      switch (cur.type) {
        case "checkbox":
        case "user-select":
        case "image":
        case "file":
        case "record-list":
        case "location":
        case "audio_video":
          value = "'[]'";
      }
    }
    values.push(value);
  }

  // const fieldMap: { [key: string]: any } = {};
  // fields.forEach((field) => (fieldMap[field.slug] = field.type));

  // const columnNames = Object.keys(data).join(", ");
  // const values = Object.values(data)
  //   .map((value, index) => {
  //     const fieldType = fieldMap[
  //       Object.keys(data)[index]
  //     ] as `${DocumentElementType}`;
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument
  //     return formatValue(value, fieldType);
  //   })
  //   .join(", ");

  const sql = `INSERT INTO ${tableName} (${columns.join(
    ","
  )}) VALUES (${values.join(",")});`;
  return sql;
}

export async function formatValue(
  value: any,
  fieldType?: `${DocumentElementType}`,
  accountId?: string,
  field?: DataField
) {
  if (fieldType === "date") {
    return `'${value || ""}'`;
  } else if (fieldType === DocumentElementType.CodeEditor) {
    if (isPlainObject(value)) {
      return `'${JSON.stringify(value).replace(/'/g, "''").trim()}'`;
    } else if (isString(value)) {
      return `'${value.replace(/'/g, "''").trim()}'`;
    }

    return `'${value}'`;
  } else if (fieldType === DocumentElementType.Select) {
    if (field?.list_default_display_type === "multi_drop_down") {
      if (isArray(value)) {
        return `'${JSON.stringify(
          value.map((v) => (isString(v) ? v.trim() : v) as unknown)
        )
          .replace(/'/g, "''")
          .trim()}'`;
      }

      return `'${JSON.stringify([
        isString(value) ? value.trim() : value,
      ]).replace(/'/g, "''")}'`;
    } else {
      return `'${
        isString(value) ? value.replace(/'/g, "''") || "" : value || ""
      }'`;
    }
  } else if (
    [
      DocumentElementType.File,
      DocumentElementType.AudioVideo,
      DocumentElementType.Image,
    ].includes(fieldType as DocumentElementType)
  ) {
    if (isEmpty(value) || !value.url || !value.name) {
      return "''";
    }
    console.log({ value });
    const chunks = (value.name as string).split(".");
    const extension = chunks.pop();
    const name = chunks.join(".");
    const s3Path = `${accountId}/uploads/${name.replace(
      /_|-/,
      ""
    )}.${extension}`;
    const url = `${S3_URL}/${s3Path}`;
    console.log("🚀 ~ file: generateInsertSql.ts:123 ~ url:", url);

    const s3 = await getS3Client();
    if (!isValidUrl(value.url as string)) {
      const data = Buffer.from(value.url as string, "binary");

      await s3
        .putObject({
          Bucket: MEDIA_BUCKET_NAME!,
          Key: s3Path,
          Body: data,
          Metadata: {
            "Content-Disposition": "attachment",
          },
        })
        .promise();

      return `'${JSON.stringify({
        name: value.name,
        url: url,
        id: v4(),
        size: data.byteLength,
      })
        .replace(/'/g, "''")
        .trim()}'`;
    } else {
      const { data } = await axios.get(value.url as string, {
        responseType: "arraybuffer",
      });
      console.log("🚀 ~ file: generateInsertSql.ts:149 ~ data:", data);

      const fileBuffer = Buffer.from(data as string, "binary");

      await s3
        .putObject({
          Bucket: MEDIA_BUCKET_NAME!,
          Key: s3Path,
          Body: data,
        })
        .promise();

      return `'${JSON.stringify({
        name: value.name,
        url: url,
        id: v4(),
        size: fileBuffer.byteLength,
      })
        .replace(/'/g, "''")
        .trim()}'`;
    }
  } else if (fieldType === DocumentElementType.Boolean) {
    return `${value ? 1 : 0}`;
  } else if (typeof value === "string") {
    return `'${value.replace(/'/g, "''").trim()}'`;
  } else if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''").trim()}'`;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return isString(value) ? value.replace(/'/g, "''") || "''" : value || "''";
  }
}

export function formatValueGet(
  value: any,
  fieldType?: `${DocumentElementType}`
) {
  if (isArray(value) || isPlainObject(value)) {
    return `'${JSON.stringify(value).replace(/'/g, "''").trim()}'`;
  } else {
    return `'${value}'`;
  }
}

export default generateInsertSql;
