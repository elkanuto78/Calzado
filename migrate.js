// Ejecutar una sola vez, con las variables de entorno DB_SERVER, DB_NAME,
// DB_USER y DB_PASSWORD ya configuradas:
//
//   node migrate.js
//
// Crea las tablas (si no existen) y, si están vacías, carga los datos
// que ya existían en productos.json y pedidos.json.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { sql, getPool } = require("./db");

async function migrar() {
  const pool = await getPool();

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.request().batch(schema);
  console.log("✓ Tablas verificadas/creadas");

  const { recordset: prodCount } = await pool.request().query("SELECT COUNT(*) AS n FROM productos");
  if (prodCount[0].n === 0) {
    const productosPath = path.join(__dirname, "productos.json");
    if (fs.existsSync(productosPath)) {
      const productos = JSON.parse(fs.readFileSync(productosPath, "utf-8"));

      // Todo en una misma transacción: SET IDENTITY_INSERT solo aplica a la
      // conexión donde se ejecuta, así que los INSERT deben usar esa misma conexión.
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        await new sql.Request(tx).batch("SET IDENTITY_INSERT productos ON");
        for (const p of productos) {
          await new sql.Request(tx)
            .input("id", sql.Int, p.id)
            .input("codigo", sql.NVarChar(10), p.codigo ?? "00")
            .input("nombre", sql.NVarChar(200), p.nombre)
            .input("tipo", sql.NVarChar(50), p.tipo)
            .input("precio", sql.Decimal(10, 2), p.precio)
            .input("descripcion", sql.NVarChar(sql.MAX), p.descripcion ?? "")
            .input("imagen", sql.NVarChar(300), p.imagen ?? "")
            .input("colores", sql.NVarChar(sql.MAX), JSON.stringify(p.colores ?? []))
            .input("tallas", sql.NVarChar(sql.MAX), JSON.stringify(p.tallas ?? []))
            .input("tag", sql.NVarChar(50), p.tag ?? null)
            .query(`INSERT INTO productos (id, codigo, nombre, tipo, precio, descripcion, imagen, colores, tallas, tag)
                    VALUES (@id, @codigo, @nombre, @tipo, @precio, @descripcion, @imagen, @colores, @tallas, @tag)`);
        }
        await new sql.Request(tx).batch("SET IDENTITY_INSERT productos OFF");
        await tx.commit();
        console.log(`✓ ${productos.length} productos migrados`);
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    }
  } else {
    console.log("→ La tabla productos ya tiene datos, se omite la migración");
  }

  const { recordset: pedCount } = await pool.request().query("SELECT COUNT(*) AS n FROM pedidos");
  if (pedCount[0].n === 0) {
    const pedidosPath = path.join(__dirname, "pedidos.json");
    if (fs.existsSync(pedidosPath)) {
      const pedidos = JSON.parse(fs.readFileSync(pedidosPath, "utf-8"));

      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        await new sql.Request(tx).batch("SET IDENTITY_INSERT pedidos ON");
        for (const p of pedidos) {
          await new sql.Request(tx)
            .input("id", sql.Int, p.id)
            .input("fecha", sql.DateTime2, new Date(p.fecha))
            .input("cliente", sql.NVarChar(sql.MAX), JSON.stringify(p.cliente))
            .input("items", sql.NVarChar(sql.MAX), JSON.stringify(p.items))
            .input("total", sql.Decimal(10, 2), p.total)
            .query(`INSERT INTO pedidos (id, fecha, cliente, items, total)
                    VALUES (@id, @fecha, @cliente, @items, @total)`);
        }
        await new sql.Request(tx).batch("SET IDENTITY_INSERT pedidos OFF");
        await tx.commit();
        console.log(`✓ ${pedidos.length} pedidos migrados`);
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    }
  } else {
    console.log("→ La tabla pedidos ya tiene datos, se omite la migración");
  }

  console.log("✓ Migración completa");
  process.exit(0);
}

migrar().catch((err) => {
  console.error("✗ Error en la migración:", err);
  process.exit(1);
});
