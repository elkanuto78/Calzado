const crypto = require("crypto");
const { ErrorNegocio } = require("./negocio");

const ROLES = ["administrador", "vendedor", "gerente"];
const RESERVADOS = ["admin"];

function hashClave(clave) {
  const sal = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(clave), sal, 64).toString("hex");
  return `scrypt$${sal}$${h}`;
}

function verificarClave(clave, guardado) {
  const [alg, sal, h] = String(guardado || "").split("$");
  if (alg !== "scrypt" || !sal || !h) return false;
  const calc = crypto.scryptSync(String(clave), sal, 64);
  const esperado = Buffer.from(h, "hex");
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}

function publico(f) {
  return {
    id: f.id,
    usuario: f.usuario,
    nombre: f.nombre,
    rol: f.rol,
    activo: f.activo === true || f.activo === 1,
    creado: f.creado || null,
  };
}

function validarUsuario(u) {
  const v = String(u || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(v)) {
    throw new ErrorNegocio(400, "El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.");
  }
  if (RESERVADOS.includes(v)) throw new ErrorNegocio(400, `El usuario "${v}" está reservado.`);
  return v;
}

function validarRol(r) {
  if (!ROLES.includes(r)) throw new ErrorNegocio(400, "Rol inválido: usa administrador, vendedor o gerente.");
  return r;
}

function validarClave(c) {
  const v = String(c || "");
  if (v.length < 8) throw new ErrorNegocio(400, "La contraseña debe tener al menos 8 caracteres.");
  if (v.length > 100) throw new ErrorNegocio(400, "La contraseña es demasiado larga.");
  return v;
}

function validarNombre(n) {
  const v = String(n || "").trim();
  if (v.length < 2 || v.length > 100) throw new ErrorNegocio(400, "Ingresa el nombre de la persona (2 a 100 caracteres).");
  return v;
}

async function listar(ctx) {
  const filas = await ctx.lista("usuarios", {}, { orden: "id ASC" });
  return filas.map(publico);
}

async function crear(ctx, { usuario, nombre, rol, clave }) {
  const u = validarUsuario(usuario);
  const datos = { usuario: u, nombre: validarNombre(nombre), rol: validarRol(rol), clave_hash: hashClave(validarClave(clave)), activo: 1 };
  if (await ctx.uno("usuarios", { usuario: u })) throw new ErrorNegocio(409, `Ya existe el usuario "${u}".`);
  return publico(await ctx.insertar("usuarios", datos));
}

async function actualizar(ctx, id, cuerpo, actorId) {
  const fila = await ctx.uno("usuarios", { id }, { bloquear: true });
  if (!fila) throw new ErrorNegocio(404, "Usuario no encontrado.");
  const cambios = {};
  if (cuerpo.nombre !== undefined) cambios.nombre = validarNombre(cuerpo.nombre);
  if (cuerpo.rol !== undefined) {
    cambios.rol = validarRol(cuerpo.rol);
    if (cambios.rol !== fila.rol && id === actorId) throw new ErrorNegocio(400, "No puedes cambiar tu propio rol.");
  }
  if (cuerpo.activo !== undefined) {
    const act = cuerpo.activo === true || cuerpo.activo === 1 || cuerpo.activo === "1" ? 1 : 0;
    if (!act && id === actorId) throw new ErrorNegocio(400, "No puedes desactivar tu propio usuario.");
    cambios.activo = act;
  }
  if (cuerpo.clave !== undefined && cuerpo.clave !== "") cambios.clave_hash = hashClave(validarClave(cuerpo.clave));
  if (!Object.keys(cambios).length) throw new ErrorNegocio(400, "No hay cambios para guardar.");
  return publico(await ctx.actualizar("usuarios", { id }, cambios));
}

async function eliminar(ctx, id, actorId) {
  if (id === actorId) throw new ErrorNegocio(400, "No puedes eliminar tu propio usuario.");
  const fila = await ctx.uno("usuarios", { id });
  if (!fila) throw new ErrorNegocio(404, "Usuario no encontrado.");
  await ctx.ejecutar(`DELETE FROM usuarios WHERE id = ${Number(id)}`);
  return { mensaje: "Usuario eliminado", usuario: publico(fila) };
}

// Devuelve la fila del usuario si usuario/clave son correctos y está activo; si no, null.
async function autenticar(ctx, usuario, clave) {
  const u = String(usuario || "").trim().toLowerCase();
  const fila = u ? await ctx.uno("usuarios", { usuario: u }) : null;
  // Se calcula el hash aunque no exista el usuario para no revelar por tiempo si existe.
  const ok = verificarClave(clave, fila ? fila.clave_hash : "scrypt$00$00");
  if (!fila || !ok || !(fila.activo === true || fila.activo === 1)) return null;
  return fila;
}

module.exports = { ROLES, hashClave, verificarClave, listar, crear, actualizar, eliminar, autenticar, publico };
