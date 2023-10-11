export default function validSqlDatabaseName(inputString: string) {
  // Remove any characters that are not letters, numbers, or underscores
  const cleanedString = inputString.replace(/[^a-zA-Z0-9_]/g, "");

  // Ensure the table name starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(cleanedString)) {
    return "d_" + cleanedString;
  }

  // Truncate the table name to a maximum length of 128 characters
  const maxLength = 128;
  const truncatedString = cleanedString.substring(0, maxLength);

  return truncatedString;
}
