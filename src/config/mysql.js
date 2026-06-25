import mysql from 'mysql2/promise';

let pool;

export const getMysqlPool = () => {
  if (!pool) {
    if (!process.env.MYSQL_CATALOG_URL) {
      throw new Error("MYSQL_CATALOG_URL no está configurada");
    }
    
    // Si la URL trae configuracion SSL en el query string, la quitamos para evitar el error de mysql2
    const cleanUrl = process.env.MYSQL_CATALOG_URL.split('?')[0];

    pool = mysql.createPool({
      uri: cleanUrl,
      multipleStatements: true,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return pool;
};
