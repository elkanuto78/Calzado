const sql = require("mssql");

// Estos valores se configuran como variables de entorno en el hosting
// (Render) y en un archivo .env cuando se corre localmente.
const config = {
  server: process.env.DB_SERVER,       // ej: calzados-paredes-server.database.windows.net
  database: process.env.DB_NAME,       // ej: calzados_paredes
  user: process.env.DB_USER,           // ej: tuusuario
  password: process.env.DB_PASSWORD,
  port: 1433,
  options: {
    encrypt: true,              // Azure SQL requiere conexión cifrada
    trustServerCertificate: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config).then((pool) => {
      console.log("✓ Conectado a Azure SQL Database");
      return pool;
    }).catch((err) => {
      poolPromise = null;
      console.error("✗ Error al conectar a la base de datos:", err.message);
      throw err;
    });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
