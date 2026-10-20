const { sql, getPool } = require("./db");

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(nombre) {
  if (!IDENT.test(nombre)) throw new Error("Identificador SQL inválido: " + nombre);
  return nombre;
}

function tipoParam(valor) {
  if (typeof valor === "number") return Number.isInteger(valor) ? sql.Int : sql.Decimal(10, 2);
  return sql.NVarChar(sql.MAX);
}

// Capa mínima de acceso a datos. Los nombres de tabla/columna provienen
// siempre del código (nunca del usuario) y los valores siempre van como
// parámetros. En las pruebas se reemplaza por una versión en memoria con
// la misma interfaz.
function crearCtx(nuevoRequest) {
  function armarWhere(request, where, prefijo) {
    const condiciones = [];
    for (const [col, valor] of Object.entries(where || {})) {
      ident(col);
      if (valor === null) {
        condiciones.push(`${col} IS NULL`);
      } else {
        request.input(prefijo + col, tipoParam(valor), valor);
        condiciones.push(`${col} = @${prefijo}${col}`);
      }
    }
    return condiciones.length ? " WHERE " + condiciones.join(" AND ") : "";
  }

  return {
    async lista(tabla, where, { orden, bloquear } = {}) {
      const request = nuevoRequest();
      const hint = bloquear ? " WITH (UPDLOCK, ROWLOCK)" : "";
      if (orden && !/^[A-Za-z_]+( (ASC|DESC))?$/i.test(orden)) throw new Error("Orden inválido");
      const q = `SELECT * FROM ${ident(tabla)}${hint}${armarWhere(request, where, "w_")}${orden ? " ORDER BY " + orden : ""}`;
      const { recordset } = await request.query(q);
      return recordset;
    },
    async uno(tabla, where, opciones) {
      const filas = await this.lista(tabla, where, opciones);
      return filas[0] || null;
    },
    async insertar(tabla, datos) {
      const request = nuevoRequest();
      const cols = Object.keys(datos).map(ident);
      cols.forEach((c) => request.input("s_" + c, tipoParam(datos[c]), datos[c]));
      const { recordset } = await request.query(
        `INSERT INTO ${ident(tabla)} (${cols.join(", ")}) OUTPUT INSERTED.* VALUES (${cols.map((c) => "@s_" + c).join(", ")})`
      );
      return recordset[0];
    },
    async actualizar(tabla, where, datos) {
      const request = nuevoRequest();
      const cols = Object.keys(datos).map(ident);
      cols.forEach((c) => request.input("s_" + c, tipoParam(datos[c]), datos[c]));
      const { recordset } = await request.query(
        `UPDATE ${ident(tabla)} SET ${cols.map((c) => `${c} = @s_${c}`).join(", ")} OUTPUT INSERTED.*${armarWhere(request, where, "w_")}`
      );
      return recordset[0] || null;
    },
    async ejecutar(texto) {
      await nuevoRequest().query(texto);
    },
  };
}

async function transaccion(fn) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const resultado = await fn(crearCtx(() => new sql.Request(tx)));
    await tx.commit();
    return resultado;
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}

async function lectura(fn) {
  const pool = await getPool();
  return fn(crearCtx(() => pool.request()));
}

module.exports = { crearCtx, transaccion, lectura };
