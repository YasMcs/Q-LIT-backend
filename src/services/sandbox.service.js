import { getMysqlPool } from '../config/mysql.js';

export const executeMockQuery = async (sqlQuery, activeDb, setupSql) => {
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
        await connection.query(setupSql);
      }

      // 2. DML (Modificaciones permitidas pero protegidas por "rollback")
      if (upperQuery.startsWith("INSERT") || upperQuery.startsWith("UPDATE") || upperQuery.startsWith("DELETE")) {
        const [result] = await connection.query(sqlQuery);
        await connection.rollback();

        return {
          success: true,
          type: "DML",
          message: `Consulta ejecutada con éxito (${result.affectedRows} row affected). Los cambios fueron revertidos automáticamente por seguridad (Rollback).`,
          columns: [],
          rows: []
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
