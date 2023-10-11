function generateCreateDatabaseSql(databaseName: string) {
  return `CREATE DATABASE ${databaseName};`;
}
export default generateCreateDatabaseSql;
