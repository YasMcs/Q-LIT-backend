import { getMysqlPool } from '../config/mysql.js';

export const executeMockQuery = async (sqlQuery, activeDb, setupSql, completedQueries = []) => {
  const pool = getMysqlPool();

  const upperQuery = sqlQuery.toUpperCase().trim();

  // 1. Bloqueo de permisos DDL
  if (upperQuery.startsWith("CREATE ") || upperQuery.startsWith("ALTER ") || upperQuery.startsWith("DROP ")) {
    throw new Error("ERROR 1142 (42000): Permisos denegados. No puedes alterar la estructura de la base de datos.");
  }

  const connection = await pool.getConnection();

  try {
    if (!/^[a-zA-Z0-9_]+$/.test(activeDb)) {
      throw new Error("Nombre de base de datos inválido.");
    }
    
    // Si la DB no existe o da error, fallará aquí
    await connection.query(`USE ${activeDb}`);

    await connection.beginTransaction();

    try {
      // Inyectar el registro de la IA
      if (setupSql && setupSql.trim().length > 0) {
        // Desactivar temporalmente la comprobación de claves foráneas para poder vaciar las tablas
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");

        // Obtener todas las tablas de la base de datos para vaciarlas temporalmente
        const [tablesRow] = await connection.query("SHOW TABLES");
        const tableKey = Object.keys(tablesRow[0] || {})[0];
        
        if (tableKey) {
          const tables = tablesRow.map(row => row[tableKey]);
          for (const table of tables) {
            await connection.query(`DELETE FROM \`${table}\``);
          }
        }
        
        // Inyectar el setupSql de la IA (manteniendo checks desactivados por si los inserts no están en orden jerárquico)
        await connection.query(setupSql);

        // Reactivar la comprobación de claves foráneas para la consulta del alumno
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");
      }

      // Inyectar el historial acumulativo de consultas superadas por el alumno
      if (completedQueries && completedQueries.length > 0) {
        for (const query of completedQueries) {
          try {
            await connection.query(query);
          } catch (historyErr) {
            console.error("Error al inyectar consulta histórica (ignorado para continuar con Sandbox):", historyErr.message, query);
          }
        }
      }

      // 2. DML (Modificaciones permitidas pero protegidas por "rollback")
      if (upperQuery.startsWith("INSERT") || upperQuery.startsWith("UPDATE") || upperQuery.startsWith("DELETE")) {
        // Extraer el nombre de la tabla afectada para consultar su estado antes del rollback
        let tableName = null;
        const updateMatch = sqlQuery.match(/UPDATE\s+\`?([a-zA-Z0-9_-]+)\`?/i);
        const insertMatch = sqlQuery.match(/INSERT\s+INTO\s+\`?([a-zA-Z0-9_-]+)\`?/i);
        const deleteMatch = sqlQuery.match(/DELETE\s+FROM\s+\`?([a-zA-Z0-9_-]+)\`?/i);

        if (updateMatch) tableName = updateMatch[1];
        else if (insertMatch) tableName = insertMatch[1];
        else if (deleteMatch) tableName = deleteMatch[1];

        const [result] = await connection.query(sqlQuery);

        let columns = [];
        let rows = [];

        // Si encontramos la tabla, traemos su contenido modificado antes del rollback
        if (tableName) {
          try {
            const [selectRows, fields] = await connection.query(`SELECT * FROM \`${tableName}\``);
            columns = fields ? fields.map(f => f.name) : [];
            rows = selectRows;
          } catch (selectErr) {
            console.error("Error al obtener la tabla modificada para el sandbox:", selectErr);
          }
        }

        await connection.rollback();

        return {
          success: true,
          type: "DML",
          message: `Consulta ejecutada con éxito. Se afectaron ${result.affectedRows} fila(s).`,
          columns,
          rows
        };
      }

      // 3. DQL (Consultas SELECT)
      if (upperQuery.startsWith("SELECT") || upperQuery.startsWith("SHOW") || upperQuery.startsWith("DESCRIBE")) {
        const [rows, fields] = await connection.query(sqlQuery);
        await connection.rollback(); 
        
        return {
          success: true,
          type: "DQL",
          message: "Consulta de lectura exitosa.",
          columns: fields ? fields.map(f => f.name) : [],
          rows: rows
        };
      }

      throw new Error("ERROR 1064 (42000): Comando no soportado o error de sintaxis. Solo se permiten comandos DML o DQL básicos.");
    } catch (queryError) {
      await connection.rollback();
      throw queryError;
    }
  } finally {
    connection.release();
  }
};
