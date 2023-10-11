import { Knex } from "knex";
import { DataField, DateType, DocumentElementType, NumericTypes } from "../../constants/dataset";
import { formatValue } from "./insertValues";

async function alterTable({
  tableName,
  oldFields,
  newFields,
  knex,
}: {
  tableName: string;
  oldFields: DataField[];
  newFields: DataField[];
  knex: Knex;
}) {
  const oldFieldNames = oldFields.map((field) => field.slug);
  const newFieldNames = newFields.map((field) => field.slug);

  const columnsToAdd = newFields.filter(
    (field) => !oldFieldNames.includes(field.slug)
  );
  const columnsToDrop = oldFields.filter(
    (field) => !newFieldNames.includes(field.slug)
  );

  await knex.schema.alterTable(tableName, function (table) {
    for (const column of columnsToAdd) {
      let colBuilder;
      switch (column.type) {
        case DocumentElementType.Select: {
          if (column.list_default_display_type == "multi_drop_down") {
            colBuilder = table.json(column.slug);
          } else {
            colBuilder = table.string(column.slug);
          }
          break;
        }
        case DocumentElementType.Label:
        case DocumentElementType.TextField:
        case DocumentElementType.UserType:
        case DocumentElementType.Radio:
          colBuilder = table.string(column.slug);
          break;
        case DocumentElementType.TextArea:
          colBuilder = table.text(column.slug);
          break;

        case DocumentElementType.CodeEditor:
        case DocumentElementType.Checkbox:
        case DocumentElementType.User:
        case DocumentElementType.Image:
        case DocumentElementType.File:
        case DocumentElementType.Location:
        case DocumentElementType.SubRecord:
        case DocumentElementType.RecordList:
        case DocumentElementType.AudioVideo:
          // For these types, you might want to store the data as JSON.
          colBuilder = table.json(column.slug);
          break;
        case DocumentElementType.Date:
          switch (column.date_type) {
            // case DateType.TimeOnly:
            //   colBuilder=table.time(column.slug);
            //   break;
            case DateType.DateOnly:
              colBuilder = table.date(column.slug);
              break;
            default:
              colBuilder = table.timestamp(column.slug);
          }
          break;
        case DocumentElementType.Number:
          switch (column.number_type) {
            case NumericTypes.TINYINT:
              colBuilder = table.tinyint(column.slug);
              break;
            case NumericTypes.SMALLINT:
              colBuilder = table.smallint(column.slug);
              break;
            case NumericTypes.MEDIUMINT:
              colBuilder = table.mediumint(column.slug);
              break;
            case NumericTypes.BIGINT:
              colBuilder = table.bigint(column.slug);
              break;
            case NumericTypes.DECIMAL:
              colBuilder = table.decimal(column.slug);
              break;
            case NumericTypes.FLOAT:
              colBuilder = table.float(column.slug);
              break;
            case NumericTypes.DOUBLE:
              colBuilder = table.double(column.slug);
              break;
            default:
              colBuilder = table.integer(column.slug);
          }
          break;
        case DocumentElementType.Rating:
        case DocumentElementType.Progress:
          colBuilder = table.integer(column.slug);
          break;
        case DocumentElementType.Boolean:
          colBuilder = table.boolean(column.slug);
          break;
        default:
          colBuilder = table.string(column.slug);
          break;
      }

      if (colBuilder && column.default_value !== undefined) {
        if (column.type === DocumentElementType.Date && column.use_current) {
          colBuilder.defaultTo(knex.fn.now());
        } else if ([DocumentElementType.TextField,
          DocumentElementType.Rating,
          DocumentElementType.Radio,
          DocumentElementType.Progress,
          DocumentElementType.Boolean,
          DocumentElementType.Number,
          DocumentElementType.Date].includes(column.type as DocumentElementType) ||
          (column.type === DocumentElementType.Select && column.list_default_display_type === "single_drop_down")) {
          colBuilder.defaultTo(formatValue(column.default_value, column.type));
        }

      }
    }

    //Soft Column Drop
    const timestamp = Date.now();
    for (const column of columnsToDrop) {
      const newColumnName = `${timestamp}_is_deleted_${column.slug}`;
      table.renameColumn(column.slug, newColumnName);
    }
  });
}

export default alterTable;




// import { Knex } from "knex";
// import { DataField, DateType, DocumentElementType, NumericTypes } from "../../constants/dataset";
// import { formatValue } from "./insertValues";

// const numberSubTypes = {
//   [NumericTypes.TINYINT]: "TINYINT",
//   [NumericTypes.SMALLINT]: "SMALLINT",
//   [NumericTypes.MEDIUMINT]: "MEDIUMINT",
//   [NumericTypes.BIGINT]: "BIGINT",
//   [NumericTypes.DECIMAL]: "DECIMAL",
//   [NumericTypes.FLOAT]: "FLOAT",
//   [NumericTypes.DOUBLE]: "DOUBLE",
// };
// async function alterTable({
//   tableName,
//   oldFields,
//   newFields,
//   knex,
// }: {
//   tableName: string;
//   oldFields: DataField[];
//   newFields: DataField[];
//   knex: Knex;
// }) {
//   const oldFieldNames = oldFields.map((field) => field.slug);
//   const newFieldNames = newFields.map((field) => field.slug);

//   const columnsToAdd = newFields.filter(
//     (field) => !oldFieldNames.includes(field.slug)
//   );
//   const columnsToDrop = oldFields.filter(
//     (field) => !newFieldNames.includes(field.slug)
//   );

//   const alterations: string[] = [];

//   for (const column of columnsToAdd) {
//     let colType: string;
//     let defaultValue: string | undefined;
//     switch (column.type) {
//       case "select":
//         colType = (column.list_default_display_type === "multi_drop_down") ? "JSON" : "VARCHAR(255)";
//         break;
//       case "label":
//       case "text-field":
//       case "user-type":
//       case "radio":
//         colType = "VARCHAR(255)";
//         break;
//       case "textarea":
//         colType = "TEXT";
//         break;
//       case "code-editor":
//       case "checkbox":
//       case "user-select":
//       case "image":
//       case "file":
//       case "location":
//       case "sub-record":
//       case "record-list":
//       case "audio_video":
//         colType = "JSON";
//         break;
//       case "date":
//         colType = (column.date_type === DateType.DateOnly) ? "DATE" : "TIMESTAMP";
//         break;
//       case "input-number":
//         colType = numberSubTypes[column.number_type as keyof typeof numberSubTypes] || "INTEGER";
//         break;
//       case "rating":
//       case "progress-display":
//         colType = "INTEGER";
//         break;
//       case "boolean":
//         colType = "TINYINT";
//         break;
//       default:
//         colType = "VARCHAR(255)";
//         break;
//     }

//     if (column.default_value !== undefined) {
//       const formattedValue = formatValue(column.default_value, column.type);
//       if (column.type === DocumentElementType.Date && column.use_current) {
//         defaultValue = "DEFAULT CURRENT_TIMESTAMP";
//       } else if (colType === "TEXT" || colType === "JSON") {

//         defaultValue = `DEFAULT ('${formattedValue}')`;
//       } else if (typeof formattedValue === "string") {
//         defaultValue = `DEFAULT '${formattedValue}'`;
//       } else {
//         defaultValue = `DEFAULT ${formattedValue}`;
//       }
//     }

//     alterations.push(`ADD ${column.slug} ${colType} ${defaultValue || ""}`);
//   }

//   const timestamp = Date.now();
//   for (const column of columnsToDrop) {
//     const newColumnName = `${timestamp}_is_deleted_${column.slug}`;
//     alterations.push(`RENAME COLUMN ${column.slug} TO ${newColumnName}`);
//   }

//   const combinedAlterationCommand = `ALTER TABLE ${tableName} ${alterations.join(", ")};`;
//   console.log({ combinedAlterationCommand }, combinedAlterationCommand);
//   await knex.raw(combinedAlterationCommand);
// }

// export default alterTable;
