require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { sql, getPool } = require("./db");
const datos = require("./datos");
const negocio = require("./negocio");
const usuarios = require("./usuarios");
const { enviarConsultaContacto, enviarAvisoPago } = require("./mailer");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".webp": "image/webp",
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
  const productos = recordset.map(mapearProducto);
  try {
    return await datos.lectura((ctx) => negocio.anotarDisponibilidad(ctx, productos));
  } catch (e) {
    console.error("No se pudo calcular la disponibilidad:", e.message);
    return productos.map((p) => ({ ...p, reservado: {}, disponible: p.stock ? { ...p.stock } : null }));
  }
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

function enviarJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data)); // compacto: menos bytes por respuesta
}

// Roles (RNF-01 / RB-02). Cuentas:
//   - "admin": siempre disponible, con la contraseña ADMIN_PASSWORD de Render.
//   - Usuarios creados por el administrador (tabla usuarios): administrador, vendedor o gerente.
// El login devuelve un token firmado (12 h) que el panel envía en el header x-admin-password.
// Por compatibilidad, enviar ADMIN_PASSWORD directamente en ese header también equivale a "admin".
function igualSeguro(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const DURACION_TOKEN_MS = 12 * 60 * 60 * 1000;
function secretoSesion() {
  return process.env.SESSION_SECRET ||
    crypto.createHash("sha256").update("cp-sesion:" + (process.env.ADMIN_PASSWORD || "")).digest("hex");
}
function firmarToken(payload) {
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const firma = crypto.createHmac("sha256", secretoSesion()).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}
function leerToken(token) {
  const [cuerpo, firma] = String(token).split(".");
  if (!cuerpo || !firma) return null;
  const esperada = crypto.createHmac("sha256", secretoSesion()).update(cuerpo).digest("base64url");
  if (!igualSeguro(firma, esperada)) return null;
  try {
    const p = JSON.parse(Buffer.from(cuerpo, "base64url").toString());
    return p && p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

// Caché de usuarios para validar rol y estado activo sin consultar la base en cada petición.
let usuariosCache = new Map();
async function refrescarUsuarios() {
  const filas = await datos.lectura((ctx) => ctx.lista("usuarios", {}));
  usuariosCache = new Map(filas.map((f) => [f.id, f]));
}
function refrescarUsuariosSilencioso() {
  return refrescarUsuarios().catch((e) => console.error("No se pudo cargar usuarios:", e.message));
}

const ADMIN_ENV = { id: 0, usuario: "admin", nombre: "Administrador", rol: "administrador" };

function sesionDe(req) {
  const clave = req.headers["x-admin-password"];
  if (!clave) return null;
  const adminPw = process.env.ADMIN_PASSWORD;
  if (adminPw && igualSeguro(clave, adminPw)) return { ...ADMIN_ENV, actor: "admin" };
  const p = leerToken(clave);
  if (!p) return null;
  if (p.id === 0) return adminPw ? { ...ADMIN_ENV, actor: "admin" } : null;
  const u = usuariosCache.get(p.id);
  if (!u || !(u.activo === true || u.activo === 1)) return null;
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, actor: `${u.usuario} (${u.rol})` };
}

// Devuelve el rol si está permitido; si no, responde 401/403 y devuelve null.
function exigir(req, res, roles) {
  const s = sesionDe(req);
  if (!s) { enviarJSON(res, 401, { error: "No autorizado" }); return null; }
  if (!roles.includes(s.rol)) { enviarJSON(res, 403, { error: "Tu rol no tiene permiso para esta acción" }); return null; }
  req.sesion = s;
  return s.rol;
}
const actorDe = (req) => (req.sesion ? req.sesion.actor : "desconocido");

// Límite simple por IP para los endpoints públicos que escriben datos.
const intentos = new Map();
function limitado(req, max, ventanaMs) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const ahora = Date.now();
  const lista = (intentos.get(ip) || []).filter((t) => ahora - t < ventanaMs);
  lista.push(ahora);
  intentos.set(ip, lista);
  return lista.length > max;
}
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, l] of intentos) if (!l.some((t) => ahora - t < 60000)) intentos.delete(ip);
}, 300000).unref();

// Archivos de texto que vale la pena comprimir con gzip.
const COMPRIMIBLES = new Set([".html", ".css", ".js", ".json", ".svg"]);
// Imágenes: si existe una versión .webp al lado (misma ruta) y el navegador la acepta, se envía esa.
const CON_VERSION_WEBP = new Set([".png", ".jpg", ".jpeg"]);
const cacheGzip = new Map(); // ruta -> { mtimeMs, buf }

function servirArchivo(req, res, filePath) {
  let ext = path.extname(filePath).toLowerCase();
  let ruta = filePath;
  const acepta = String((req && req.headers["accept"]) || "");
  const aceptaGzip = /\bgzip\b/.test(String((req && req.headers["accept-encoding"]) || ""));

  if (CON_VERSION_WEBP.has(ext) && acepta.includes("image/webp")) {
    const webp = filePath.slice(0, -ext.length) + ".webp";
    try {
      if (fs.statSync(webp).isFile()) { ruta = webp; ext = ".webp"; }
    } catch { /* no hay versión webp: se sirve el original */ }
  }

  fs.stat(ruta, (errStat, st) => {
    if (errStat || !st.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const etag = `"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
    const cabeceras = {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "ETag": etag,
      "Last-Modified": st.mtime.toUTCString(),
      // HTML/CSS/JS: siempre se revalidan (304 si no cambiaron). Imágenes y fuentes: caché de 7 días.
      "Cache-Control": COMPRIMIBLES.has(ext) ? "no-cache" : "public, max-age=604800",
    };
    if (CON_VERSION_WEBP.has(path.extname(filePath).toLowerCase())) cabeceras["Vary"] = "Accept";
    if (COMPRIMIBLES.has(ext)) cabeceras["Vary"] = "Accept-Encoding";

    if (req && req.headers["if-none-match"] === etag) {
      res.writeHead(304, cabeceras);
      return res.end();
    }

    fs.readFile(ruta, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      if (aceptaGzip && COMPRIMIBLES.has(ext) && data.length > 1024) {
        const previo = cacheGzip.get(ruta);
        if (previo && previo.mtimeMs === st.mtimeMs) {
          res.writeHead(200, { ...cabeceras, "Content-Encoding": "gzip", "Content-Length": previo.buf.length });
          return res.end(previo.buf);
        }
        return zlib.gzip(data, { level: 6 }, (e, buf) => {
          if (e) { res.writeHead(200, cabeceras); return res.end(data); }
          cacheGzip.set(ruta, { mtimeMs: st.mtimeMs, buf });
          res.writeHead(200, { ...cabeceras, "Content-Encoding": "gzip", "Content-Length": buf.length });
          res.end(buf);
        });
      }
      res.writeHead(200, { ...cabeceras, "Content-Length": data.length });
      res.end(data);
    });
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

function leerBodySeguro(req, res) {
  return leerBody(req).catch((e) => {
    enviarJSON(res, 400, { error: e.message });
    return null;
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
      const T = datos.transaccion;
      const PERSONAL = ["administrador", "vendedor"];
      let m;

      // ---- Sesión y configuración
      if (ruta === "/sesion" && method === "GET") {
        const rol = exigir(req, res, ["administrador", "vendedor", "gerente"]);
        if (!rol) return;
        const { usuario, nombre } = req.sesion;
        return enviarJSON(res, 200, { rol, usuario, nombre });
      }

      if (ruta === "/login" && method === "POST") {
        if (limitado(req, 10, 5 * 60 * 1000)) {
          return enviarJSON(res, 429, { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." });
        }
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        const u = String(body.usuario || "").trim().toLowerCase();
        const clave = String(body.clave || "");
        let sesion = null;
        if (u === "admin") {
          if (process.env.ADMIN_PASSWORD && igualSeguro(clave, process.env.ADMIN_PASSWORD)) sesion = ADMIN_ENV;
        } else {
          const fila = await datos.lectura((ctx) => usuarios.autenticar(ctx, u, clave));
          if (fila) sesion = { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol };
        }
        if (!sesion) return enviarJSON(res, 401, { error: "Usuario o contraseña incorrectos." });
        const token = firmarToken({ id: sesion.id, exp: Date.now() + DURACION_TOKEN_MS });
        return enviarJSON(res, 200, { token, rol: sesion.rol, usuario: sesion.usuario, nombre: sesion.nombre });
      }

      // ---- Gestión de usuarios (solo administrador)
      if (ruta === "/usuarios" && method === "GET") {
        if (!exigir(req, res, ["administrador"])) return;
        return enviarJSON(res, 200, await datos.lectura((ctx) => usuarios.listar(ctx)));
      }
      if (ruta === "/usuarios" && method === "POST") {
        if (!exigir(req, res, ["administrador"])) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        const nuevo = await T((ctx) => usuarios.crear(ctx, body));
        await refrescarUsuariosSilencioso();
        return enviarJSON(res, 201, nuevo);
      }
      if ((m = ruta.match(/^\/usuarios\/(\d+)$/)) && method === "PATCH") {
        if (!exigir(req, res, ["administrador"])) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        const act = await T((ctx) => usuarios.actualizar(ctx, Number(m[1]), body, req.sesion.id));
        await refrescarUsuariosSilencioso();
        return enviarJSON(res, 200, act);
      }
      if ((m = ruta.match(/^\/usuarios\/(\d+)$/)) && method === "DELETE") {
        if (!exigir(req, res, ["administrador"])) return;
        const r = await T((ctx) => usuarios.eliminar(ctx, Number(m[1]), req.sesion.id));
        await refrescarUsuariosSilencioso();
        return enviarJSON(res, 200, r);
      }

      if (ruta === "/config" && method === "GET") {
        return enviarJSON(res, 200, await datos.lectura((ctx) => negocio.leerConfig(ctx)));
      }
      if (ruta === "/config" && method === "PUT") {
        if (!exigir(req, res, ["administrador"])) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.guardarConfig(ctx, body)));
      }

      // ---- Productos
      const matchId = ruta.match(/^\/productos\/(\d+)$/);

      if (ruta === "/productos" && method === "GET") {
        await T((ctx) => negocio.vencerReservas(ctx)).catch((e) => console.error("Vencimiento de reservas:", e.message));
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
        if (!exigir(req, res, PERSONAL)) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        const { nombre, tipo, precio } = body;
        if (!nombre || !tipo || precio === undefined) {
          return enviarJSON(res, 400, { error: "Campos requeridos: nombre, tipo, precio" });
        }
        return enviarJSON(res, 201, await crearProducto(body));
      }

      if (matchId && method === "PUT") {
        if (!exigir(req, res, PERSONAL)) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        const actualizado = await actualizarProducto(Number(matchId[1]), body);
        if (!actualizado) return enviarJSON(res, 404, { error: "Producto no encontrado" });
        return enviarJSON(res, 200, actualizado);
      }

      const matchStock = ruta.match(/^\/productos\/(\d+)\/stock$/);
      if (matchStock && (method === "PATCH" || method === "PUT")) {
        if (!exigir(req, res, PERSONAL)) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        const id = Number(matchStock[1]);
        if (method === "PUT") {
          const existente = await obtenerProducto(id);
          if (!existente) return enviarJSON(res, 404, { error: "Producto no encontrado" });
          return enviarJSON(res, 200, await actualizarProducto(id, { stock: body.stock ?? null }));
        }
        if (body.talla === undefined || (body.delta === undefined && body.cantidad === undefined)) {
          return enviarJSON(res, 400, { error: "Campos requeridos: talla y (delta o cantidad)" });
        }
        const r = await ajustarStock(id, body);
        if (r.error) return enviarJSON(res, r.status, { error: r.error });
        return enviarJSON(res, 200, r.producto);
      }

      if (matchId && method === "DELETE") {
        if (!exigir(req, res, ["administrador"])) return;
        const eliminado = await eliminarProducto(Number(matchId[1]));
        if (!eliminado) return enviarJSON(res, 404, { error: "Producto no encontrado" });
        return enviarJSON(res, 200, { mensaje: "Producto eliminado", producto: eliminado });
      }

      // ---- Pedidos (público: registrar, informar pago y seguimiento)
      if (ruta === "/pedidos" && method === "POST") {
        if (limitado(req, 15, 60000)) return enviarJSON(res, 429, { error: "Demasiadas solicitudes. Intenta en un minuto." });
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        const pedido = await T((ctx) => negocio.crearPedido(ctx, body));
        const cfg = await datos.lectura((ctx) => negocio.leerConfig(ctx));
        return enviarJSON(res, 201, { ...pedido, instrucciones_pago: cfg.instrucciones_pago, minutos_reserva: cfg.minutos_reserva });
      }

      if (ruta === "/pedidos/pago" && method === "POST") {
        if (limitado(req, 15, 60000)) return enviarJSON(res, 429, { error: "Demasiadas solicitudes. Intenta en un minuto." });
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        let pedidoAviso = null;
        const pago = await T(async (ctx) => {
          const fila = await ctx.uno("pedidos", { codigo: String(body.codigo || "").trim().toUpperCase() });
          if (!fila) throw new negocio.ErrorNegocio(404, "No encontramos un pedido con ese código");
          pedidoAviso = negocio.mapearPedido(fila);
          return negocio.registrarPago(ctx, fila.id, { medio: body.medio, referencia: body.referencia, voucher: body.voucher }, "cliente");
        });
        // Aviso por correo a la tienda (sin esperar ni afectar la respuesta al cliente).
        if (pedidoAviso) {
          const host = req.headers["x-forwarded-host"] || req.headers.host || "";
          const proto = req.headers["x-forwarded-proto"] || "https";
          enviarAvisoPago({
            codigo: pedidoAviso.codigo, cliente: pedidoAviso.cliente, total: pedidoAviso.total,
            medio: pago.medio, referencia: pago.referencia, tieneVoucher: pago.tiene_voucher,
            urlPanel: host ? `${proto}://${host}/admin.html` : "/admin.html",
          }).catch(() => {});
        }
        return enviarJSON(res, 201, { id: pago.id, estado: pago.estado, medio: pago.medio });
      }

      if (ruta === "/seguimiento" && method === "GET") {
        if (limitado(req, 40, 60000)) return enviarJSON(res, 429, { error: "Demasiadas solicitudes. Intenta en un minuto." });
        return enviarJSON(res, 200, await T((ctx) => negocio.seguimiento(ctx, url.searchParams.get("codigo"))));
      }

      // ---- Pedidos (interno)
      if (ruta === "/pedidos" && method === "GET") {
        if (!exigir(req, res, PERSONAL)) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.listarPedidos(ctx)));
      }

      if (ruta === "/pedidos/exportar" && method === "GET") {
        if (!exigir(req, res, PERSONAL)) return;
        const desde = url.searchParams.get("desde") || "";
        const hasta = url.searchParams.get("hasta") || "";
        for (const f of [desde, hasta]) {
          if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return enviarJSON(res, 400, { error: "Fechas con formato AAAA-MM-DD" });
        }
        const csv = await T((ctx) => negocio.exportarPedidosCsv(ctx, { desde, hasta }));
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="pedidos.csv"',
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(csv);
      }

      if ((m = ruta.match(/^\/pedidos\/(\d+)\/reserva$/)) && method === "PATCH") {
        if (!exigir(req, res, PERSONAL)) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.extenderReserva(ctx, Number(m[1]), body.minutos, actorDe(req))));
      }

      if ((m = ruta.match(/^\/pedidos\/(\d+)$/)) && method === "GET") {
        if (!exigir(req, res, PERSONAL)) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.detallePedido(ctx, Number(m[1]))));
      }

      if ((m = ruta.match(/^\/pedidos\/(\d+)\/pagos$/)) && method === "POST") {
        const rol = exigir(req, res, PERSONAL);
        if (!rol) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 201, await T((ctx) => negocio.registrarPago(ctx, Number(m[1]), body, actorDe(req))));
      }

      if ((m = ruta.match(/^\/pagos\/(\d+)\/voucher$/)) && method === "GET") {
        if (!exigir(req, res, PERSONAL)) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.leerVoucher(ctx, Number(m[1]))));
      }

      if ((m = ruta.match(/^\/pagos\/(\d+)$/)) && method === "PATCH") {
        const rol = exigir(req, res, ["administrador"]);
        if (!rol) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.resolverPago(ctx, Number(m[1]), body, actorDe(req))));
      }

      if ((m = ruta.match(/^\/pedidos\/(\d+)\/estado$/)) && method === "PATCH") {
        const rol = exigir(req, res, PERSONAL);
        if (!rol) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.cambiarEstado(ctx, Number(m[1]), body.estado, body, actorDe(req))));
      }

      if ((m = ruta.match(/^\/pedidos\/(\d+)\/comprobante$/)) && method === "PATCH") {
        const rol = exigir(req, res, ["administrador"]);
        if (!rol) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.registrarComprobante(ctx, Number(m[1]), body, actorDe(req))));
      }

      if ((m = ruta.match(/^\/pedidos\/(\d+)\/entrega$/)) && method === "POST") {
        const rol = exigir(req, res, PERSONAL);
        if (!rol) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.registrarEntrega(ctx, Number(m[1]), body, actorDe(req))));
      }

      // ---- Cambios, devoluciones y reclamos
      if (ruta === "/reclamos" && method === "GET") {
        if (!exigir(req, res, PERSONAL)) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.listarReclamos(ctx)));
      }
      if (ruta === "/reclamos" && method === "POST") {
        const rol = exigir(req, res, PERSONAL);
        if (!rol) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 201, await T((ctx) => negocio.crearReclamo(ctx, body, actorDe(req))));
      }
      if ((m = ruta.match(/^\/reclamos\/(\d+)$/)) && method === "PATCH") {
        const rol = exigir(req, res, PERSONAL);
        if (!rol) return;
        const body = await leerBodySeguro(req, res);
        if (!body) return;
        return enviarJSON(res, 200, await T((ctx) => negocio.actualizarReclamo(ctx, Number(m[1]), body, actorDe(req))));
      }

      // ---- Reportes (administrador y gerente)
      if (ruta === "/reportes" && method === "GET") {
        if (!exigir(req, res, ["administrador", "gerente"])) return;
        const desde = url.searchParams.get("desde") || "";
        const hasta = url.searchParams.get("hasta") || "";
        for (const f of [desde, hasta]) {
          if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return enviarJSON(res, 400, { error: "Fechas con formato AAAA-MM-DD" });
        }
        return enviarJSON(res, 200, await T((ctx) => negocio.reportes(ctx, { desde, hasta })));
      }

      if (ruta === "/contacto" && method === "POST") {
        const body = await leerBodySeguro(req, res);
        if (!body) return;
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
      return servirArchivo(req, res, path.join(PUBLIC_DIR, "index.html"));
    }

    const filePath = path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    servirArchivo(req, res, filePath);
  } catch (err) {
    if (err instanceof negocio.ErrorNegocio) {
      return enviarJSON(res, err.status, { error: err.message, ...err.extra });
    }
    console.error("Error en la solicitud:", err);
    enviarJSON(res, 500, { error: "Error interno del servidor" });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor Calzados Paredes corriendo en http://localhost:${PORT}`);
  datos
    .lectura((ctx) => negocio.asegurarEsquema(ctx))
    .then(() => { console.log("Esquema verificado (stock, pagos, reservas, historial, reclamos, usuarios)"); return refrescarUsuariosSilencioso(); })
    .catch((e) => console.error("No se pudo verificar el esquema:", e.message));

  setInterval(refrescarUsuariosSilencioso, 60000).unref();

  // Libera las reservas sin pago vencidas (cada minuto).
  setInterval(() => {
    datos.transaccion((ctx) => negocio.vencerReservas(ctx)).catch((e) => console.error("Vencimiento de reservas:", e.message));
  }, 60000).unref();
});
