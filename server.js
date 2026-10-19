require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const { sql, getPool } = require("./db");
const { enviarConsultaContacto } = require("./mailer");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

// Convierte una fila de la tabla productos (con colores/tallas como texto JSON)
// al mismo formato que ya usaba el frontend.
function mapearProducto(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    tipo: row.tipo,
    precio: Number(row.precio),
    descripcion: row.descripcion,
    imagen: row.imagen,
    colores: JSON.parse(row.colores || "[]"),
    tallas: JSON.parse(row.tallas || "[]"),
    tag: row.tag,
    stock: parsearStock(row.stock),
  };
}

// stock = objeto { talla: cantidad } o null (null = "sin control de stock").
function parsearStock(texto) {
  if (texto === null || texto === undefined || texto === "") return null;
  try {
    const obj = JSON.parse(texto);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

// Limpia el stock recibido: enteros >= 0. Si se pasan tallas, solo se
// conservan esas y las que falten quedan en 0. null => sin control.
function sanearStock(stock, tallas) {
  if (stock === null || stock === undefined) return null;
  if (typeof stock !== "object" || Array.isArray(stock)) return null;
  const limpio = {};
  const claves = Array.isArray(tallas) && tallas.length ? tallas.map(String) : Object.keys(stock);
  for (const t of claves) {
    const n = Math.floor(Number(stock[t]));
    limpio[t] = Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0;
  }
  return limpio;
}

// Crea la columna stock si todavía no existe (migración automática).
async function asegurarEsquema() {
  const pool = await getPool();
  await pool.request().query(
    "IF COL_LENGTH('productos','stock') IS NULL ALTER TABLE productos ADD stock NVARCHAR(MAX) NULL"
  );
}

function mapearPedido(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    cliente: JSON.parse(row.cliente),
    items: JSON.parse(row.items),
    total: Number(row.total),
  };
}

async function leerProductos({ tipo, tag, minPrecio, maxPrecio } = {}) {
  const pool = await getPool();
  const request = pool.request();
  let where = [];

  if (tipo) { request.input("tipo", sql.NVarChar(50), tipo); where.push("tipo = @tipo"); }
  if (tag) { request.input("tag", sql.NVarChar(50), tag); where.push("tag = @tag"); }
  if (!isNaN(minPrecio)) { request.input("minPrecio", sql.Decimal(10, 2), minPrecio); where.push("precio >= @minPrecio"); }
  if (!isNaN(maxPrecio)) { request.input("maxPrecio", sql.Decimal(10, 2), maxPrecio); where.push("precio <= @maxPrecio"); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { recordset } = await request.query(`SELECT * FROM productos ${whereClause} ORDER BY id`);
  return recordset.map(mapearProducto);
}

async function obtenerProducto(id) {
  const pool = await getPool();
  const { recordset } = await pool.request().input("id", sql.Int, id).query("SELECT * FROM productos WHERE id = @id");
  return recordset[0] ? mapearProducto(recordset[0]) : null;
}

async function crearProducto(data) {
  const pool = await getPool();
  const { nombre, tipo, precio, descripcion, imagen, colores, tallas, tag, codigo } = data;
  const stock = sanearStock(data.stock, tallas);
  const { recordset } = await pool
    .request()
    .input("codigo", sql.NVarChar(10), codigo ?? "00")
    .input("nombre", sql.NVarChar(200), nombre)
    .input("tipo", sql.NVarChar(50), tipo)
    .input("precio", sql.Decimal(10, 2), Number(precio))
    .input("descripcion", sql.NVarChar(sql.MAX), descripcion ?? "")
    .input("imagen", sql.NVarChar(sql.MAX), imagen ?? "")
    .input("colores", sql.NVarChar(sql.MAX), JSON.stringify(colores ?? []))
    .input("tallas", sql.NVarChar(sql.MAX), JSON.stringify(tallas ?? []))
    .input("tag", sql.NVarChar(50), tag ?? null)
    .input("stock", sql.NVarChar(sql.MAX), stock ? JSON.stringify(stock) : null)
    .query(`INSERT INTO productos (codigo, nombre, tipo, precio, descripcion, imagen, colores, tallas, tag, stock)
            OUTPUT INSERTED.*
            VALUES (@codigo, @nombre, @tipo, @precio, @descripcion, @imagen, @colores, @tallas, @tag, @stock)`);
  return mapearProducto(recordset[0]);
}

async function actualizarProducto(id, data) {
  const existente = await obtenerProducto(id);
  if (!existente) return null;
  const actualizado = { ...existente, ...data };
  // Si el body no trae "stock" se conserva el actual; si trae null, se quita el control.
  const stockFinal = sanearStock("stock" in data ? data.stock : existente.stock, actualizado.tallas);

  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input("id", sql.Int, id)
    .input("codigo", sql.NVarChar(10), actualizado.codigo)
    .input("nombre", sql.NVarChar(200), actualizado.nombre)
    .input("tipo", sql.NVarChar(50), actualizado.tipo)
    .input("precio", sql.Decimal(10, 2), Number(actualizado.precio))
    .input("descripcion", sql.NVarChar(sql.MAX), actualizado.descripcion)
    .input("imagen", sql.NVarChar(sql.MAX), actualizado.imagen)
    .input("colores", sql.NVarChar(sql.MAX), JSON.stringify(actualizado.colores ?? []))
    .input("tallas", sql.NVarChar(sql.MAX), JSON.stringify(actualizado.tallas ?? []))
    .input("tag", sql.NVarChar(50), actualizado.tag)
    .input("stock", sql.NVarChar(sql.MAX), stockFinal ? JSON.stringify(stockFinal) : null)
    .query(`UPDATE productos SET codigo=@codigo, nombre=@nombre, tipo=@tipo, precio=@precio,
              descripcion=@descripcion, imagen=@imagen, colores=@colores, tallas=@tallas, tag=@tag, stock=@stock
            OUTPUT INSERTED.*
            WHERE id=@id`);
  return recordset[0] ? mapearProducto(recordset[0]) : null;
}

// Ajusta el stock de una talla de forma atómica. Admite { delta } (suma/resta)
// o { cantidad } (valor absoluto). Devuelve el producto actualizado.
async function ajustarStock(id, { talla, delta, cantidad }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const { recordset } = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query("SELECT * FROM productos WITH (UPDLOCK, ROWLOCK) WHERE id = @id");
    if (!recordset[0]) { await tx.rollback(); return { error: "Producto no encontrado", status: 404 }; }
    const prod = mapearProducto(recordset[0]);
    const clave = String(talla);
    if (!prod.tallas.map(String).includes(clave)) { await tx.rollback(); return { error: "Talla no válida para este producto", status: 400 }; }
    const stock = prod.stock || sanearStock({}, prod.tallas);
    const actual = Number(stock[clave]) || 0;
    const nuevo = cantidad !== undefined ? Math.floor(Number(cantidad)) : actual + Math.floor(Number(delta));
    if (!Number.isFinite(nuevo)) { await tx.rollback(); return { error: "Cantidad inválida", status: 400 }; }
    stock[clave] = Math.max(0, nuevo);
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("stock", sql.NVarChar(sql.MAX), JSON.stringify(stock))
      .query("UPDATE productos SET stock=@stock WHERE id=@id");
    await tx.commit();
    return { producto: { ...prod, stock } };
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}

async function eliminarProducto(id) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input("id", sql.Int, id)
    .query("DELETE FROM productos OUTPUT DELETED.* WHERE id = @id");
  return recordset[0] ? mapearProducto(recordset[0]) : null;
}

async function leerPedidos() {
  const pool = await getPool();
  const { recordset } = await pool.request().query("SELECT * FROM pedidos ORDER BY id");
  return recordset.map(mapearPedido);
}

// Devuelve la fecha/hora actual como texto en horario de Lima (UTC-5, sin
// horario de verano), independiente de en qué zona horaria esté el servidor
// donde corre Node (Render corre en UTC).
function obtenerFechaLima() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const obj = {};
  partes.forEach(({ type, value }) => (obj[type] = value));
  return `${obj.year}-${obj.month}-${obj.day}T${obj.hour}:${obj.minute}:${obj.second}`;
}

async function crearPedido({ cliente, items, total }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // Unidades pedidas por producto y talla (sumando todos los colores).
    const pedido = {};
    for (const it of Array.isArray(items) ? items : []) {
      const id = Number(it.id);
      const cant = Math.floor(Number(it.cantidad)) || 0;
      if (!Number.isInteger(id) || cant <= 0) continue;
      const t = String(it.talla);
      pedido[id] = pedido[id] || {};
      pedido[id][t] = (pedido[id][t] || 0) + cant;
    }

    const faltantes = [];
    const nuevos = {};
    for (const id of Object.keys(pedido).map(Number).sort((a, b) => a - b)) {
      const { recordset } = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query("SELECT id, nombre, stock FROM productos WITH (UPDLOCK, ROWLOCK) WHERE id = @id");
      if (!recordset[0]) continue;
      const stock = parsearStock(recordset[0].stock);
      if (!stock) continue; // sin control de stock
      for (const [talla, cant] of Object.entries(pedido[id])) {
        const disp = Number(stock[talla]) || 0;
        if (cant > disp) faltantes.push({ id, nombre: recordset[0].nombre, talla, disponible: disp });
        else stock[talla] = disp - cant;
      }
      nuevos[id] = stock;
    }

    if (faltantes.length) {
      await tx.rollback();
      return { faltantes };
    }

    for (const [id, stock] of Object.entries(nuevos)) {
      await new sql.Request(tx)
        .input("id", sql.Int, Number(id))
        .input("stock", sql.NVarChar(sql.MAX), JSON.stringify(stock))
        .query("UPDATE productos SET stock=@stock WHERE id=@id");
    }

    const { recordset } = await new sql.Request(tx)
      .input("fecha", sql.VarChar(30), obtenerFechaLima())
      .input("cliente", sql.NVarChar(sql.MAX), JSON.stringify(cliente))
      .input("items", sql.NVarChar(sql.MAX), JSON.stringify(items))
      .input("total", sql.Decimal(10, 2), Number(total))
      .query(`INSERT INTO pedidos (fecha, cliente, items, total)
              OUTPUT INSERTED.*
              VALUES (CAST(@fecha AS DATETIME2), @cliente, @items, @total)`);
    await tx.commit();
    return { pedido: mapearPedido(recordset[0]) };
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}

function enviarJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
}

// Compara la contraseña enviada en el header x-admin-password contra la
// configurada en el servidor. Se usa para proteger todas las rutas que
// crean, editan o borran datos (productos y pedidos).
function esAdmin(req) {
  const claveAdmin = req.headers["x-admin-password"];
  return Boolean(process.env.ADMIN_PASSWORD) && claveAdmin === process.env.ADMIN_PASSWORD;
}

function servirArchivo(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function leerBody(req) {
  const LIMITE_BYTES = 8 * 1024 * 1024; // 8 MB, suficiente para una imagen en base64
  return new Promise((resolve, reject) => {
    let raw = "";
    let tamanio = 0;
    req.on("data", (chunk) => {
      tamanio += chunk.length;
      if (tamanio > LIMITE_BYTES) {
        reject(new Error("El cuerpo de la solicitud es demasiado grande (máx. 8MB)"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON inválido en el body"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE",
      "Access-Control-Allow-Headers": "Content-Type,x-admin-password",
    });
    return res.end();
  }

  try {
    if (pathname.startsWith("/api/")) {
      const ruta = pathname.slice(4);
      const matchId = ruta.match(/^\/productos\/(\d+)$/);

      if (ruta === "/productos" && method === "GET") {
        const tipo = url.searchParams.get("tipo");
        const tag = url.searchParams.get("tag");
        const minPrecio = parseFloat(url.searchParams.get("min_precio"));
        const maxPrecio = parseFloat(url.searchParams.get("max_precio"));
        const productos = await leerProductos({ tipo, tag, minPrecio, maxPrecio });
        return enviarJSON(res, 200, { total: productos.length, productos });
      }

      if (matchId && method === "GET") {
        const producto = await obtenerProducto(Number(matchId[1]));
        if (!producto) return enviarJSON(res, 404, { error: "Producto no encontrado" });
        return enviarJSON(res, 200, producto);
      }

      if (ruta === "/productos" && method === "POST") {
        if (!esAdmin(req)) return enviarJSON(res, 401, { error: "No autorizado" });
        let body;
        try {
          body = await leerBody(req);
        } catch (e) {
          return enviarJSON(res, 400, { error: e.message });
        }
        const { nombre, tipo, precio } = body;
        if (!nombre || !tipo || precio === undefined) {
          return enviarJSON(res, 400, { error: "Campos requeridos: nombre, tipo, precio" });
        }
        const nuevo = await crearProducto(body);
        return enviarJSON(res, 201, nuevo);
      }

      if (matchId && method === "PUT") {
        if (!esAdmin(req)) return enviarJSON(res, 401, { error: "No autorizado" });
        let body;
        try {
          body = await leerBody(req);
        } catch (e) {
          return enviarJSON(res, 400, { error: e.message });
        }
        const actualizado = await actualizarProducto(Number(matchId[1]), body);
        if (!actualizado) return enviarJSON(res, 404, { error: "Producto no encontrado" });
        return enviarJSON(res, 200, actualizado);
      }

      const matchStock = ruta.match(/^\/productos\/(\d+)\/stock$/);
      if (matchStock && (method === "PATCH" || method === "PUT")) {
        if (!esAdmin(req)) return enviarJSON(res, 401, { error: "No autorizado" });
        let body;
        try {
          body = await leerBody(req);
        } catch (e) {
          return enviarJSON(res, 400, { error: e.message });
        }
        const id = Number(matchStock[1]);
        if (method === "PUT") {
          // Reemplaza todo el stock (objeto) o lo quita (null).
          const existente = await obtenerProducto(id);
          if (!existente) return enviarJSON(res, 404, { error: "Producto no encontrado" });
          const act = await actualizarProducto(id, { stock: body.stock ?? null });
          return enviarJSON(res, 200, act);
        }
        if (body.talla === undefined || (body.delta === undefined && body.cantidad === undefined)) {
          return enviarJSON(res, 400, { error: "Campos requeridos: talla y (delta o cantidad)" });
        }
        const r = await ajustarStock(id, body);
        if (r.error) return enviarJSON(res, r.status, { error: r.error });
        return enviarJSON(res, 200, r.producto);
      }

      if (matchId && method === "DELETE") {
        if (!esAdmin(req)) return enviarJSON(res, 401, { error: "No autorizado" });
        const eliminado = await eliminarProducto(Number(matchId[1]));
        if (!eliminado) return enviarJSON(res, 404, { error: "Producto no encontrado" });
        return enviarJSON(res, 200, { mensaje: "Producto eliminado", producto: eliminado });
      }

      if (ruta === "/pedidos" && method === "GET") {
        if (!esAdmin(req)) return enviarJSON(res, 401, { error: "No autorizado" });
        return enviarJSON(res, 200, await leerPedidos());
      }

      if (ruta === "/pedidos" && method === "POST") {
        let body;
        try {
          body = await leerBody(req);
        } catch (e) {
          return enviarJSON(res, 400, { error: e.message });
        }
        const { cliente, items, total } = body;
        if (!cliente || !items || !total) {
          return enviarJSON(res, 400, { error: "Campos requeridos: cliente, items, total" });
        }
        const resultado = await crearPedido(body);
        if (resultado.faltantes) {
          return enviarJSON(res, 409, {
            error: "Algunos productos ya no tienen stock suficiente",
            detalle: resultado.faltantes,
          });
        }
        return enviarJSON(res, 201, resultado.pedido);
      }

      if (ruta === "/contacto" && method === "POST") {
        let body;
        try {
          body = await leerBody(req);
        } catch (e) {
          return enviarJSON(res, 400, { error: e.message });
        }
        const { nombre, email, telefono, mensaje } = body;
        if (!nombre || !email || !mensaje) {
          return enviarJSON(res, 400, { error: "Campos requeridos: nombre, email, mensaje" });
        }
        try {
          await enviarConsultaContacto({ nombre, email, telefono, mensaje });
        } catch (e) {
          console.error("No se pudo enviar el correo de contacto:", e.message);
          return enviarJSON(res, 502, { error: "No se pudo enviar tu mensaje. Intenta de nuevo más tarde." });
        }
        return enviarJSON(res, 200, { mensaje: "Consulta enviada correctamente" });
      }

      return enviarJSON(res, 404, { error: "Ruta de API no encontrada" });
    }

    if (pathname === "/" || pathname === "/index.html") {
      return servirArchivo(res, path.join(PUBLIC_DIR, "index.html"));
    }

    const filePath = path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    servirArchivo(res, filePath);
  } catch (err) {
    console.error("Error en la solicitud:", err);
    enviarJSON(res, 500, { error: "Error interno del servidor" });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor Calzados Paredes corriendo en http://localhost:${PORT}`);
  asegurarEsquema()
    .then(() => console.log("Esquema verificado (columna stock lista)"))
    .catch((e) => console.error("No se pudo verificar el esquema:", e.message));
});
