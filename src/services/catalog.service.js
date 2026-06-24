import { getMysqlPool } from '../config/mysql.js';

export const getCatalogs = async () => {
  const pool = getMysqlPool();
  const connection = await pool.getConnection();

  try {
    // 1. Obtener bases de datos, ignorando las de sistema
    const [dbs] = await connection.query('SHOW DATABASES');
    const systemDbs = ['information_schema', 'mysql', 'performance_schema', 'sys', 'defaultdb'];
    
    const validDbs = dbs
      .map(row => row.Database)
      .filter(db => !systemDbs.includes(db));

    const catalogs = [];

    // 2. Por cada DB, obtener sus tablas y columnas
    for (const dbName of validDbs) {
      await connection.query(`USE ${dbName}`);
      
      const [tablesRow] = await connection.query('SHOW TABLES');
      const tableKey = `Tables_in_${dbName}`;
      const tables = tablesRow.map(row => row[tableKey] || row[Object.keys(row)[0]]);
      
      const tablesInfo = [];
      
      for (const tableName of tables) {
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        
        tablesInfo.push({
          name: tableName,
          columns: columns.map(col => ({
            field: col.Field,
            type: col.Type,
            null: col.Null,
            key: col.Key,
            default: col.Default,
            extra: col.Extra
          }))
        });
      }

      catalogs.push({
        name: dbName,
        tables: tablesInfo
      });
    }

    return catalogs;
  } finally {
    connection.release();
  }
};
