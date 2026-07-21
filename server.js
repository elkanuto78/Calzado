require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const { sql, getPool } = require("./db");

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
  };
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
  const { recordset } = await pool
    .request()
    .input("codigo", sql.NVarChar(10), codigo ?? "00")
    .input("nombre", sql.NVarChar(200), nombre)
    .input("tipo", sql.NVarChar(50), tipo)
    .input("precio", sql.Decimal(10, 2), Number(precio))
    .input("descripcion", sql.NVarChar(sql.MAX), descripcion ?? "")
    .input("imagen", sql.NVarChar(300), imagen ?? "")
    .input("colores", sql.NVarChar(sql.MAX), JSON.stringify(colores ?? []))
    .input("tallas", sql.NVarChar(sql.MAX), JSON.stringify(tallas ?? []))
    .input("tag", sql.NVarChar(50), tag ?? null)
    .query(`INSERT INTO productos (codigo, nombre, tipo, precio, descripcion, imagen, colores, tallas, tag)
            OUTPUT INSERTED.*
            VALUES (@codigo, @nombre, @tipo, @precio, @descripcion, @imagen, @colores, @tallas, @tag)`);
  return mapearProducto(recordset[0]);
}

async function actualizarProducto(id, data) {
  const existente = await obtenerProducto(id);
  if (!existente) return null;
  const actualizado = { ...existente, ...data };

  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input("id", sql.Int, id)
    .input("codigo", sql.NVarChar(10), actualizado.codigo)
    .input("nombre", sql.NVarChar(200), actualizado.nombre)
    .input("tipo", sql.NVarChar(50), actualizado.tipo)
    .input("precio", sql.Decimal(10, 2), Number(actualizado.precio))
    .input("descripcion", sql.NVarChar(sql.MAX), actualizado.descripcion)
    .input("imagen", sql.NVarChar(300), actualizado.imagen)
    .input("colores", sql.NVarChar(sql.MAX), JSON.stringify(actualizado.colores ?? []))
    .input("tallas", sql.NVarChar(sql.MAX), JSON.stringify(actualizado.tallas ?? []))
    .input("tag", sql.NVarChar(50), actualizado.tag)
    .query(`UPDATE productos SET codigo=@codigo, nombre=@nombre, tipo=@tipo, precio=@precio,
              descripcion=@descripcion, imagen=@imagen, colores=@colores, tallas=@tallas, tag=@tag
            OUTPUT INSERTED.*
            WHERE id=@id`);
  return recordset[0] ? mapearProducto(recordset[0]) : null;
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
  const { recordset } = await pool
    .request()
    .input("fecha", sql.VarChar(30), obtenerFechaLima())
    .input("cliente", sql.NVarChar(sql.MAX), JSON.stringify(cliente))
    .input("items", sql.NVarChar(sql.MAX), JSON.stringify(items))
    .input("total", sql.Decimal(10, 2), Number(total))
    .query(`INSERT INTO pedidos (fecha, cliente, items, total)
            OUTPUT INSERTED.*
            VALUES (CAST(@fecha AS DATETIME2), @cliente, @items, @total)`);
  return mapearPedido(recordset[0]);
}

function enviarJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
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
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
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
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
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

      if (matchId && method === "DELETE") {
        const eliminado = await eliminarProducto(Number(matchId[1]));
        if (!eliminado) return enviarJSON(res, 404, { error: "Producto no encontrado" });
        return enviarJSON(res, 200, { mensaje: "Producto eliminado", producto: eliminado });
      }

      if (ruta === "/pedidos" && method === "GET") {
        const claveAdmin = req.headers["x-admin-password"];
        if (!process.env.ADMIN_PASSWORD || claveAdmin !== process.env.ADMIN_PASSWORD) {
          return enviarJSON(res, 401, { error: "No autorizado" });
        }
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
        const nuevoPedido = await crearPedido(body);
        return enviarJSON(res, 201, nuevoPedido);
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
});
