const crypto = require("crypto");

class ErrorNegocio extends Error {
  constructor(status, mensaje, extra) {
    super(mensaje);
    this.status = status;
    this.extra = extra || {};
  }
}

const ESTADOS_PEDIDO = ["PENDIENTE", "RESERVADO", "PAGO_VALIDADO", "EN_PREPARACION", "ENTREGADO", "CANCELADO"];
const ESTADOS_CONFIRMADOS = ["PAGO_VALIDADO", "EN_PREPARACION", "ENTREGADO"];
const MEDIOS_PAGO = ["Yape", "Plin", "Transferencia", "Depósito", "Otro"];
const TIPOS_RECLAMO = ["cambio_talla", "devolucion", "fabricacion_8_dias", "reclamo"];
const ESTADOS_RECLAMO = ["ABIERTO", "EN_PROCESO", "RESUELTO", "RECHAZADO"];
const CONFIG_DEFECTO = { minutos_reserva: "30", instrucciones_pago: "", qr_yape: "", qr_plin: "" };
const MAX_IMAGEN_CHARS = 600000; // ~450 KB de imagen en base64

// Acepta solo imágenes en base64 (data URL) de tamaño acotado. Devuelve el texto o lanza error.
function validarImagen(valor, nombre) {
  const v = String(valor || "");
  if (v.length > MAX_IMAGEN_CHARS) throw new ErrorNegocio(400, `${nombre}: la imagen es demasiado pesada (máx. ~450 KB)`);
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)) {
    throw new ErrorNegocio(400, `${nombre}: el archivo debe ser una imagen JPG, PNG o WEBP`);
  }
  return v;
}

let reloj = () => new Date();
function setReloj(fn) { reloj = fn; }

// Fecha/hora de Lima (UTC-5, sin horario de verano) como texto ISO sin zona.
function ahora() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(reloj());
  const o = {};
  partes.forEach(({ type, value }) => (o[type] = value));
  const hora = o.hour === "24" ? "00" : o.hour;
  return `${o.year}-${o.month}-${o.day}T${hora}:${o.minute}:${o.second}`;
}

function sumarMinutos(iso, minutos) {
  return new Date(new Date(iso + "Z").getTime() + minutos * 60000).toISOString().slice(0, 19);
}

function parsear(texto, defecto) {
  if (texto === null || texto === undefined || texto === "") return defecto;
  try { return JSON.parse(texto); } catch { return defecto; }
}

function normalizarEstado(e) {
  const v = String(e || "PENDIENTE");
  if (v === "pendiente") return "PENDIENTE";
  if (v === "recibido") return "ENTREGADO";
  return v.toUpperCase();
}

function mapearPedido(row) {
  return {
    id: row.id,
    codigo: row.codigo || null,
    fecha: row.fecha,
    cliente: parsear(row.cliente, {}),
    items: parsear(row.items, []),
    total: Number(row.total),
    estado: normalizarEstado(row.estado),
    reserva_vence: row.reserva_vence || null,
    comprobante: row.comprobante_numero ? { tipo: row.comprobante_tipo, numero: row.comprobante_numero } : null,
    entrega: row.entrega_responsable
      ? { tipo: row.entrega_tipo, fecha: row.entrega_fecha, responsable: row.entrega_responsable }
      : null,
  };
}

function mapearPago(row, todosMismaRef) {
  const duplicada = (todosMismaRef || []).some(
    (o) => o.id !== row.id && o.medio === row.medio && ["POR_VALIDAR", "VALIDADO"].includes(o.estado)
  );
  return {
    id: row.id,
    pedido_id: row.pedido_id,
    medio: row.medio,
    referencia: row.referencia,
    monto: Number(row.monto),
    estado: row.estado,
    fecha: row.fecha,
    validado_por: row.validado_por || null,
    validado_fecha: row.validado_fecha || null,
    nota: row.nota || null,
    duplicada,
    tiene_voucher: row.tiene_voucher === true || row.tiene_voucher === 1,
  };
}

function stockDe(prod) {
  const o = parsear(prod.stock, null);
  return o && typeof o === "object" && !Array.isArray(o) ? o : null;
}
function tallasDe(prod) {
  return parsear(prod.tallas, []).map(String);
}

function generarCodigo(prefijo) {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alfabeto[crypto.randomInt(alfabeto.length)];
  return `${prefijo}-${s}`;
}

async function codigoUnico(ctx, tabla, prefijo) {
  for (let i = 0; i < 8; i++) {
    const c = generarCodigo(prefijo);
    if (!(await ctx.uno(tabla, { codigo: c }))) return c;
  }
  throw new ErrorNegocio(500, "No se pudo generar un código único");
}

async function registrarHistorial(ctx, pedidoId, de, a, usuario, nota) {
  await ctx.insertar("historial_estado", {
    pedido_id: pedidoId,
    estado_anterior: de,
    estado_nuevo: a,
    usuario,
    fecha: ahora(),
    nota: nota || null,
  });
}

// ---------------------------------------------------------------- Config
async function leerConfig(ctx) {
  const cfg = { ...CONFIG_DEFECTO };
  for (const fila of await ctx.lista("configuracion")) cfg[fila.clave] = fila.valor;
  return {
    minutos_reserva: Math.max(5, Math.min(1440, parseInt(cfg.minutos_reserva, 10) || 30)),
    instrucciones_pago: cfg.instrucciones_pago || "",
    qr: { yape: cfg.qr_yape || "", plin: cfg.qr_plin || "" },
    medios: MEDIOS_PAGO,
  };
}

async function guardarConfig(ctx, datos) {
  const cambios = {};
  if (datos.minutos_reserva !== undefined) {
    const m = parseInt(datos.minutos_reserva, 10);
    if (!Number.isInteger(m) || m < 5 || m > 1440) {
      throw new ErrorNegocio(400, "Los minutos de reserva deben estar entre 5 y 1440");
    }
    cambios.minutos_reserva = String(m);
  }
  if (datos.instrucciones_pago !== undefined) {
    cambios.instrucciones_pago = String(datos.instrucciones_pago).slice(0, 1500);
  }
  for (const [campo, nombre] of [["qr_yape", "QR de Yape"], ["qr_plin", "QR de Plin"]]) {
    if (datos[campo] !== undefined) cambios[campo] = datos[campo] === "" || datos[campo] === null ? "" : validarImagen(datos[campo], nombre);
  }
  for (const [clave, valor] of Object.entries(cambios)) {
    const existe = await ctx.uno("configuracion", { clave });
    if (existe) await ctx.actualizar("configuracion", { clave }, { valor });
    else await ctx.insertar("configuracion", { clave, valor });
  }
  return leerConfig(ctx);
}

// ---------------------------------------------------------------- Stock
// RB-01: disponible = stock físico − reservas activas
async function reservadoPorTalla(ctx, productoId) {
  const mapa = {};
  for (const r of await ctx.lista("reservas", { producto_id: productoId, estado: "ACTIVA" })) {
    mapa[r.talla] = (mapa[r.talla] || 0) + Number(r.cantidad);
  }
  return mapa;
}

async function anotarDisponibilidad(ctx, productos) {
  const todas = await ctx.lista("reservas", { estado: "ACTIVA" });
  return productos.map((p) => {
    const reservado = {};
    todas.filter((r) => r.producto_id === p.id).forEach((r) => {
      reservado[r.talla] = (reservado[r.talla] || 0) + Number(r.cantidad);
    });
    let disponible = null;
    if (p.stock) {
      disponible = {};
      for (const t of Object.keys(p.stock)) {
        disponible[t] = Math.max(0, (Number(p.stock[t]) || 0) - (reservado[t] || 0));
      }
    }
    return { ...p, reservado, disponible };
  });
}

// ---------------------------------------------------------------- Pedidos
function validarCliente(c) {
  c = c || {};
  const nombre = String(c.nombre || "").trim();
  const dni = String(c.dni || "").trim();
  const telefono = String(c.telefono || "").trim();
  const email = String(c.email || "").trim();
  const direccion = String(c.direccion || "").trim();
  if (nombre.length < 3 || nombre.length > 120) throw new ErrorNegocio(400, "Ingresa tu nombre completo");
  if (!/^\d{8}$/.test(dni)) throw new ErrorNegocio(400, "El DNI debe tener 8 dígitos");
  if (telefono.replace(/\D/g, "").length < 7 || telefono.length > 20) throw new ErrorNegocio(400, "Ingresa un teléfono válido");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorNegocio(400, "Correo inválido");
  if (direccion.length < 5 || direccion.length > 250) throw new ErrorNegocio(400, "Ingresa una dirección válida");
  return { nombre, dni, telefono, email, direccion, nota: String(c.nota || "").trim().slice(0, 300) };
}

async function crearPedido(ctx, { cliente, items }) {
  const cli = validarCliente(cliente);
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    throw new ErrorNegocio(400, "El pedido debe tener entre 1 y 30 productos");
  }

  await vencerReservas(ctx);
  const cfg = await leerConfig(ctx);

  const lineas = [];
  const necesario = {};
  const productos = {};
  for (const it of items) {
    const id = Number(it.id);
    const cantidad = Number(it.cantidad);
    if (!Number.isInteger(id) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) {
      throw new ErrorNegocio(400, "Producto o cantidad inválida");
    }
    productos[id] = null;
  }
  // Bloqueo en orden creciente de id para evitar interbloqueos entre pedidos simultáneos.
  for (const id of Object.keys(productos).map(Number).sort((x, y) => x - y)) {
    productos[id] = await ctx.uno("productos", { id }, { bloquear: true });
    if (!productos[id]) {
      throw new ErrorNegocio(409, "Uno de los productos ya no existe", { detalle: [{ id, nombre: "Producto", talla: "-", disponible: 0 }] });
    }
  }
  for (const it of items) {
    const id = Number(it.id);
    const cantidad = Number(it.cantidad);
    const p = productos[id];
    const talla = String(it.talla);
    if (!tallasDe(p).includes(talla)) throw new ErrorNegocio(400, `La talla ${talla} no está disponible para ${p.nombre}`);
    necesario[id] = necesario[id] || {};
    necesario[id][talla] = (necesario[id][talla] || 0) + cantidad;
    const precio = Number(p.precio);
    lineas.push({
      id, nombre: p.nombre, talla: it.talla, color: String(it.color || "—"),
      cantidad, precio, subtotal: Math.round(precio * cantidad * 100) / 100,
    });
  }

  const faltantes = [];
  const reservas = [];
  for (const id of Object.keys(necesario).map(Number).sort((a, b) => a - b)) {
    const stock = stockDe(productos[id]);
    if (!stock) continue;
    const reservado = await reservadoPorTalla(ctx, id);
    for (const [talla, cant] of Object.entries(necesario[id])) {
      const disp = (Number(stock[talla]) || 0) - (reservado[talla] || 0);
      if (cant > disp) faltantes.push({ id, nombre: productos[id].nombre, talla, disponible: Math.max(0, disp) });
      else reservas.push({ producto_id: id, talla, cantidad: cant });
    }
  }
  if (faltantes.length) {
    throw new ErrorNegocio(409, "Algunos productos ya no tienen stock suficiente", { detalle: faltantes });
  }

  const total = Math.round(lineas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
  const fecha = ahora();
  const fila = await ctx.insertar("pedidos", {
    codigo: await codigoUnico(ctx, "pedidos", "CP"),
    fecha,
    cliente: JSON.stringify(cli),
    items: JSON.stringify(lineas),
    total,
    estado: "RESERVADO",
    reserva_vence: sumarMinutos(fecha, cfg.minutos_reserva),
  });
  for (const r of reservas) {
    await ctx.insertar("reservas", { pedido_id: fila.id, ...r, estado: "ACTIVA" });
  }
  await registrarHistorial(ctx, fila.id, null, "PENDIENTE", "cliente", "Pedido registrado");
  await registrarHistorial(ctx, fila.id, "PENDIENTE", "RESERVADO", "sistema", "Stock reservado");
  return mapearPedido(fila);
}

async function obtenerPedido(ctx, id) {
  const fila = await ctx.uno("pedidos", { id: Number(id) });
  if (!fila) throw new ErrorNegocio(404, "Pedido no encontrado");
  return fila;
}

async function liberarReservas(ctx, pedidoId) {
  for (const r of await ctx.lista("reservas", { pedido_id: pedidoId, estado: "ACTIVA" })) {
    await ctx.actualizar("reservas", { id: r.id }, { estado: "LIBERADA" });
  }
}

async function cancelarFila(ctx, fila, usuario, nota) {
  await ctx.actualizar("pedidos", { id: fila.id }, { estado: "CANCELADO" });
  await liberarReservas(ctx, fila.id); // RB-03
  await registrarHistorial(ctx, fila.id, normalizarEstado(fila.estado), "CANCELADO", usuario, nota);
}

// Más de N minutos sin pago registrado => cancelar y liberar la reserva.
async function vencerReservas(ctx) {
  const t = ahora();
  let n = 0;
  for (const fila of await ctx.lista("pedidos", { estado: "RESERVADO" })) {
    if (!fila.reserva_vence || fila.reserva_vence >= t) continue;
    const pagos = await ctx.lista("pagos", { pedido_id: fila.id });
    if (pagos.some((p) => p.estado === "POR_VALIDAR" || p.estado === "VALIDADO")) continue;
    await cancelarFila(ctx, fila, "sistema", "Vencimiento de la reserva sin pago");
    n++;
  }
  return n;
}

async function listarPedidos(ctx) {
  await vencerReservas(ctx);
  const filas = await ctx.lista("pedidos", {}, { orden: "id" });
  const pagos = await ctx.lista("pagos", {}, { orden: "id" });
  return filas.map((f) => {
    const p = mapearPedido(f);
    const mios = pagos.filter((x) => x.pedido_id === f.id);
    p.pagos = mios.map((x) => ({ id: x.id, medio: x.medio, estado: x.estado }));
    p.pago_estado = mios.length ? mios[mios.length - 1].estado : null;
    return p;
  });
}

async function detallePedido(ctx, id) {
  const fila = await obtenerPedido(ctx, id);
  const pagos = [];
  for (const p of await ctx.lista("pagos", { pedido_id: fila.id }, { orden: "id" })) {
    pagos.push(mapearPago(p, await ctx.lista("pagos", { referencia: p.referencia })));
  }
  return {
    ...mapearPedido(fila),
    pagos,
    historial: await ctx.lista("historial_estado", { pedido_id: fila.id }, { orden: "id" }),
    reclamos: await ctx.lista("reclamos", { pedido_id: fila.id }, { orden: "id" }),
  };
}

async function seguimiento(ctx, codigo) {
  await vencerReservas(ctx);
  const fila = await ctx.uno("pedidos", { codigo: String(codigo || "").trim().toUpperCase() });
  if (!fila) throw new ErrorNegocio(404, "No encontramos un pedido con ese código");
  const p = mapearPedido(fila);
  const pagos = await ctx.lista("pagos", { pedido_id: fila.id }, { orden: "id" });
  return {
    codigo: p.codigo,
    estado: p.estado,
    fecha: p.fecha,
    total: p.total,
    reserva_vence: p.reserva_vence,
    items: p.items.map((i) => ({ nombre: i.nombre, talla: i.talla, color: i.color, cantidad: i.cantidad })),
    pagos: pagos.map((x) => ({ medio: x.medio, estado: x.estado, fecha: x.fecha })),
    comprobante: p.comprobante,
    entrega: p.entrega ? { tipo: p.entrega.tipo, fecha: p.entrega.fecha } : null,
  };
}

// ---------------------------------------------------------------- Pagos
function limpiarReferencia(ref) {
  const r = String(ref || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (r.length < 3 || r.length > 40 || !/^[A-Z0-9ÁÉÍÓÚÑ\-_./ ]+$/.test(r)) {
    throw new ErrorNegocio(400, "Ingresa el código o número de operación del pago (3 a 40 caracteres)");
  }
  // RB-05: no se piden ni guardan números de tarjeta o cuenta.
  if (/\d{13,}/.test(r.replace(/[\s\-]/g, ""))) {
    throw new ErrorNegocio(400, "Ingresa solo el código de operación, no números de tarjeta o cuenta");
  }
  return r;
}

// Extiende la reserva de un pedido que aún no se pagó (por ejemplo, si el cliente avisó que pagará más tarde).
async function extenderReserva(ctx, id, minutos, usuario) {
  const fila = await obtenerPedido(ctx, id);
  const estado = normalizarEstado(fila.estado);
  if (estado !== "RESERVADO" || !fila.reserva_vence) {
    throw new ErrorNegocio(409, "Solo se puede extender la reserva de un pedido reservado y aún sin pago");
  }
  const m = parseInt(minutos, 10);
  if (!Number.isInteger(m) || m < 5 || m > 1440) throw new ErrorNegocio(400, "Los minutos deben estar entre 5 y 1440");
  const ahoraIso = ahora();
  const base = String(fila.reserva_vence) > ahoraIso ? String(fila.reserva_vence) : ahoraIso;
  const nueva = sumarMinutos(base, m);
  await ctx.actualizar("pedidos", { id: fila.id }, { reserva_vence: nueva });
  await registrarHistorial(ctx, fila.id, estado, estado, usuario, `Reserva extendida ${m} min (vence ${nueva.replace("T", " ")})`);
  return { reserva_vence: nueva };
}

function celdaCsv(v) {
  let t = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // evita fórmulas al abrir en Excel
  return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

// CSV de pedidos (separado por comas, con BOM para que Excel respete las tildes).
async function exportarPedidosCsv(ctx, { desde, hasta }) {
  await vencerReservas(ctx);
  const fechaDe = (f) => (f instanceof Date ? f.toISOString() : String(f)).slice(0, 10);
  const filas = (await ctx.lista("pedidos", {}, { orden: "id" })).filter((f) => {
    const d = fechaDe(f.fecha);
    return (!desde || d >= desde) && (!hasta || d <= hasta);
  });
  const pagos = await ctx.lista("pagos", {}, { orden: "id" });
  const cab = ["Código", "Fecha", "Estado", "Cliente", "DNI", "Teléfono", "Correo", "Dirección", "Productos", "Total",
    "Medio de pago", "Operación", "Estado del pago", "Validado por", "Comprobante", "Entrega"];
  const lineas = [cab.map(celdaCsv).join(",")];
  for (const f of filas) {
    const p = mapearPedido(f);
    const c = p.cliente || {};
    const mios = pagos.filter((x) => x.pedido_id === f.id);
    const pg = mios[mios.length - 1] || {};
    const fecha = f.fecha instanceof Date ? f.fecha.toISOString() : String(f.fecha);
    lineas.push([
      p.codigo || "#" + p.id,
      fecha.slice(0, 16).replace("T", " "),
      p.estado,
      c.nombre, c.dni, c.telefono, c.email, c.direccion,
      p.items.map((i) => `${i.cantidad}x ${i.nombre} (talla ${i.talla}, ${i.color})`).join(" | "),
      p.total.toFixed(2),
      pg.medio, pg.referencia, pg.estado, pg.validado_por,
      p.comprobante ? `${p.comprobante.tipo} ${p.comprobante.numero}` : "",
      p.entrega ? `${p.entrega.tipo} ${p.entrega.responsable}` : "",
    ].map(celdaCsv).join(","));
  }
  return "\ufeff" + lineas.join("\r\n") + "\r\n";
}

async function leerVoucher(ctx, pagoId) {
  const v = await ctx.uno("vouchers", { pago_id: pagoId });
  if (!v) throw new ErrorNegocio(404, "Este pago no tiene voucher");
  return { voucher: v.imagen };
}

async function registrarPago(ctx, pedidoId, { medio, referencia, monto, voucher }, usuario) {
  const fila = await obtenerPedido(ctx, pedidoId);
  const estado = normalizarEstado(fila.estado);
  if (estado === "CANCELADO") {
    throw new ErrorNegocio(409, "El pedido está cancelado (la reserva venció). Realiza un nuevo pedido o contacta a la tienda.");
  }
  if (!["PENDIENTE", "RESERVADO"].includes(estado)) {
    throw new ErrorNegocio(409, "Este pedido ya tiene el pago validado");
  }
  if (!MEDIOS_PAGO.includes(medio)) throw new ErrorNegocio(400, "Medio de pago no válido");
  const ref = limpiarReferencia(referencia);
  const imagenVoucher = voucher ? validarImagen(voucher, "Voucher") : null;
  const existentes = await ctx.lista("pagos", { pedido_id: fila.id });
  if (existentes.some((p) => p.estado === "POR_VALIDAR")) {
    throw new ErrorNegocio(409, "Ya hay un pago en revisión para este pedido");
  }
  if (existentes.length >= 6) throw new ErrorNegocio(429, "Demasiados intentos de pago para este pedido");
  let importe = Number(fila.total);
  if (monto !== undefined && monto !== null && monto !== "") {
    importe = Number(monto);
    if (!Number.isFinite(importe) || importe <= 0 || importe > 1000000) throw new ErrorNegocio(400, "Monto inválido");
  }
  const pago = await ctx.insertar("pagos", {
    pedido_id: fila.id,
    medio,
    referencia: ref,
    monto: Math.round(importe * 100) / 100,
    estado: "POR_VALIDAR",
    fecha: ahora(),
    tiene_voucher: imagenVoucher ? 1 : 0,
  });
  if (imagenVoucher) await ctx.insertar("vouchers", { pago_id: pago.id, imagen: imagenVoucher });
  await registrarHistorial(ctx, fila.id, estado, estado, usuario, `Pago informado (${medio} · ${ref})${imagenVoucher ? " con voucher" : ""}`);
  return mapearPago(pago, await ctx.lista("pagos", { referencia: ref }));
}

async function consumirReservas(ctx, pedidoId) {
  for (const r of await ctx.lista("reservas", { pedido_id: pedidoId, estado: "ACTIVA" })) {
    const prod = await ctx.uno("productos", { id: r.producto_id }, { bloquear: true });
    if (prod) {
      const stock = stockDe(prod);
      if (stock) {
        stock[r.talla] = Math.max(0, (Number(stock[r.talla]) || 0) - Number(r.cantidad));
        await ctx.actualizar("productos", { id: prod.id }, { stock: JSON.stringify(stock) });
      }
    }
    await ctx.actualizar("reservas", { id: r.id }, { estado: "CONSUMIDA" });
  }
}

// RF-07 / RB-02: solo Administración (el control de rol se hace en el servidor).
async function resolverPago(ctx, pagoId, { resultado, nota, confirmarDuplicada }, usuario) {
  if (resultado !== "VALIDADO" && resultado !== "RECHAZADO") {
    throw new ErrorNegocio(400, 'resultado debe ser "VALIDADO" o "RECHAZADO"');
  }
  const pago = await ctx.uno("pagos", { id: Number(pagoId) });
  if (!pago) throw new ErrorNegocio(404, "Pago no encontrado");
  if (pago.estado !== "POR_VALIDAR") throw new ErrorNegocio(409, "Este pago ya fue resuelto");
  const fila = await obtenerPedido(ctx, pago.pedido_id);
  const estado = normalizarEstado(fila.estado);

  if (resultado === "VALIDADO") {
    if (!["PENDIENTE", "RESERVADO"].includes(estado)) {
      throw new ErrorNegocio(409, "El pedido ya no admite validar este pago (estado " + estado + ")");
    }
    const mismos = await ctx.lista("pagos", { referencia: pago.referencia });
    const dup = mismos.some((o) => o.id !== pago.id && o.medio === pago.medio && ["POR_VALIDAR", "VALIDADO"].includes(o.estado));
    if (dup && !confirmarDuplicada) {
      throw new ErrorNegocio(409, "Referencia duplicada: otro pago usa el mismo código. Revísalo antes de validar.", { duplicada: true });
    }
  }

  const fecha = ahora();
  const act = await ctx.actualizar("pagos", { id: pago.id }, {
    estado: resultado,
    validado_por: usuario,
    validado_fecha: fecha,
    nota: nota ? String(nota).slice(0, 300) : null,
  });

  if (resultado === "VALIDADO") {
    await ctx.actualizar("pedidos", { id: fila.id }, { estado: "PAGO_VALIDADO" });
    await consumirReservas(ctx, fila.id);
    await registrarHistorial(ctx, fila.id, estado, "PAGO_VALIDADO", usuario, "Pago validado");
  } else {
    await registrarHistorial(ctx, fila.id, estado, estado, usuario, "Pago rechazado" + (nota ? ": " + nota : ""));
  }
  return mapearPago(act, await ctx.lista("pagos", { referencia: act.referencia }));
}

// ---------------------------------------------------------------- Estados
const TRANSICIONES = {
  PAGO_VALIDADO: ["EN_PREPARACION"],
  PENDIENTE: ["CANCELADO"],
  RESERVADO: ["CANCELADO"],
};

async function cambiarEstado(ctx, id, nuevo, { nota }, usuario) {
  const fila = await obtenerPedido(ctx, id);
  const actual = normalizarEstado(fila.estado);
  if (nuevo === "ENTREGADO") throw new ErrorNegocio(409, "Para entregar el pedido registra la entrega (responsable y fecha)");
  if (!ESTADOS_PEDIDO.includes(nuevo) || !(TRANSICIONES[actual] || []).includes(nuevo)) {
    throw new ErrorNegocio(409, `Transición no permitida: ${actual} → ${nuevo}`);
  }
  if (nuevo === "CANCELADO") {
    const pagos = await ctx.lista("pagos", { pedido_id: fila.id });
    if (pagos.some((p) => p.estado === "POR_VALIDAR")) {
      throw new ErrorNegocio(409, "Hay un pago en revisión: resuélvelo (validar o rechazar) antes de cancelar");
    }
    await cancelarFila(ctx, fila, usuario, nota || "Cancelado manualmente");
  } else {
    await ctx.actualizar("pedidos", { id: fila.id }, { estado: nuevo });
    await registrarHistorial(ctx, fila.id, actual, nuevo, usuario, nota);
  }
  return mapearPedido(await obtenerPedido(ctx, id));
}

async function registrarComprobante(ctx, id, { tipo, numero }, usuario) {
  const fila = await obtenerPedido(ctx, id);
  const estado = normalizarEstado(fila.estado);
  if (!ESTADOS_CONFIRMADOS.includes(estado)) {
    throw new ErrorNegocio(409, "Solo se registra comprobante cuando el pago está validado");
  }
  if (tipo !== "boleta" && tipo !== "factura") throw new ErrorNegocio(400, 'El tipo debe ser "boleta" o "factura"');
  const num = String(numero || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-]{2,29}$/.test(num)) throw new ErrorNegocio(400, "Número de comprobante inválido (ej. B001-00012345)");
  await ctx.actualizar("pedidos", { id: fila.id }, { comprobante_tipo: tipo, comprobante_numero: num });
  await registrarHistorial(ctx, fila.id, estado, estado, usuario, `Comprobante registrado: ${tipo} ${num}`);
  return mapearPedido(await obtenerPedido(ctx, id));
}

async function registrarEntrega(ctx, id, { tipo, responsable, fecha }, usuario) {
  const fila = await obtenerPedido(ctx, id);
  const estado = normalizarEstado(fila.estado);
  if (estado !== "EN_PREPARACION") {
    throw new ErrorNegocio(409, "Solo se puede entregar un pedido en preparación (con pago validado)");
  }
  if (tipo !== "entrega" && tipo !== "retiro") throw new ErrorNegocio(400, 'El tipo debe ser "entrega" o "retiro"');
  const resp = String(responsable || "").trim();
  if (resp.length < 2 || resp.length > 100) throw new ErrorNegocio(400, "Indica el responsable de la entrega");
  let f = ahora();
  if (fecha) {
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(String(fecha))) throw new ErrorNegocio(400, "Fecha inválida");
    f = String(fecha).length === 10 ? fecha + "T00:00:00" : String(fecha).length === 16 ? fecha + ":00" : String(fecha);
  }
  await ctx.actualizar("pedidos", { id: fila.id }, {
    estado: "ENTREGADO", entrega_tipo: tipo, entrega_fecha: f, entrega_responsable: resp,
  });
  await registrarHistorial(ctx, fila.id, estado, "ENTREGADO", usuario, `${tipo === "retiro" ? "Retiro" : "Entrega"} registrado por ${resp}`);
  return mapearPedido(await obtenerPedido(ctx, id));
}

// ---------------------------------------------------------------- Reclamos
async function crearReclamo(ctx, datos, usuario) {
  const fila = await obtenerPedido(ctx, datos.pedido_id);
  const estado = normalizarEstado(fila.estado);
  if (!ESTADOS_CONFIRMADOS.includes(estado)) {
    throw new ErrorNegocio(409, "Solo se registran cambios o reclamos de pedidos con pago validado");
  }
  if (!TIPOS_RECLAMO.includes(datos.tipo)) throw new ErrorNegocio(400, "Tipo de incidencia no válido");
  const motivo = String(datos.motivo || "").trim();
  if (motivo.length < 5 || motivo.length > 500) throw new ErrorNegocio(400, "Describe el motivo (mínimo 5 caracteres)");
  const responsable = String(datos.responsable || "").trim();
  if (responsable.length < 2) throw new ErrorNegocio(400, "Indica el responsable");

  const campos = { producto_id: null, talla: null, cantidad: null };
  if (datos.producto_id !== undefined && datos.producto_id !== null && datos.producto_id !== "") {
    const items = parsear(fila.items, []);
    const linea = items.find((i) => Number(i.id) === Number(datos.producto_id) && String(i.talla) === String(datos.talla));
    const cant = Number(datos.cantidad || 1);
    if (!linea || !Number.isInteger(cant) || cant < 1 || cant > linea.cantidad) {
      throw new ErrorNegocio(400, "El producto o la cantidad no corresponden al pedido");
    }
    campos.producto_id = Number(datos.producto_id);
    campos.talla = String(datos.talla);
    campos.cantidad = cant;
  }
  const r = await ctx.insertar("reclamos", {
    codigo: await codigoUnico(ctx, "reclamos", "RC"),
    pedido_id: fila.id,
    tipo: datos.tipo,
    motivo,
    estado: "ABIERTO",
    responsable,
    fecha: ahora(),
    reingresado: 0,
    ...campos,
  });
  await registrarHistorial(ctx, fila.id, estado, estado, usuario, `Incidencia ${r.codigo} (${datos.tipo})`);
  return r;
}

async function actualizarReclamo(ctx, id, { estado, nota, reingresar_stock }, usuario) {
  const r = await ctx.uno("reclamos", { id: Number(id) });
  if (!r) throw new ErrorNegocio(404, "Incidencia no encontrada");
  if (!ESTADOS_RECLAMO.includes(estado)) throw new ErrorNegocio(400, "Estado no válido");
  if (["RESUELTO", "RECHAZADO"].includes(r.estado)) throw new ErrorNegocio(409, "La incidencia ya está cerrada");
  const cambios = { estado, nota: nota ? String(nota).slice(0, 500) : r.nota || null };
  if (["RESUELTO", "RECHAZADO"].includes(estado)) cambios.resuelto_fecha = ahora();

  // Ajuste de inventario: devolución o cambio que retorna el calzado a stock.
  if (estado === "RESUELTO" && reingresar_stock && r.producto_id && !r.reingresado) {
    const prod = await ctx.uno("productos", { id: r.producto_id }, { bloquear: true });
    const stock = prod && stockDe(prod);
    if (stock && r.talla in stock) {
      stock[r.talla] = (Number(stock[r.talla]) || 0) + Number(r.cantidad);
      await ctx.actualizar("productos", { id: prod.id }, { stock: JSON.stringify(stock) });
      cambios.reingresado = 1;
    }
  }
  const act = await ctx.actualizar("reclamos", { id: r.id }, cambios);
  const fila = await ctx.uno("pedidos", { id: r.pedido_id });
  if (fila) {
    const e = normalizarEstado(fila.estado);
    await registrarHistorial(ctx, fila.id, e, e, usuario, `Incidencia ${r.codigo}: ${estado}${cambios.reingresado ? " (stock reingresado)" : ""}`);
  }
  return act;
}

// ---------------------------------------------------------------- Reportes
async function reportes(ctx, { desde, hasta }) {
  await vencerReservas(ctx);
  const fechaDe = (f) => (f instanceof Date ? f.toISOString() : String(f)).slice(0, 10);
  const dentro = (f) => {
    const d = fechaDe(f);
    return (!desde || d >= desde) && (!hasta || d <= hasta);
  };
  const filas = (await ctx.lista("pedidos", {}, { orden: "id" })).filter((f) => dentro(f.fecha));
  const pedidos = filas.map(mapearPedido);

  const porEstado = {};
  ESTADOS_PEDIDO.forEach((e) => (porEstado[e] = { cantidad: 0, total: 0 }));
  pedidos.forEach((p) => {
    porEstado[p.estado] = porEstado[p.estado] || { cantidad: 0, total: 0 };
    porEstado[p.estado].cantidad++;
    porEstado[p.estado].total = Math.round((porEstado[p.estado].total + p.total) * 100) / 100;
  });

  const confirmados = pedidos.filter((p) => ESTADOS_CONFIRMADOS.includes(p.estado));
  const ventas = Math.round(confirmados.reduce((s, p) => s + p.total, 0) * 100) / 100;

  const unidades = {};
  confirmados.forEach((p) => p.items.forEach((i) => {
    unidades[i.nombre] = (unidades[i.nombre] || 0) + Number(i.cantidad);
  }));
  const top = Object.entries(unidades).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nombre, cantidad]) => ({ nombre, cantidad }));

  const ids = new Set(filas.map((f) => f.id));
  const pagosPorEstado = { POR_VALIDAR: 0, VALIDADO: 0, RECHAZADO: 0 };
  (await ctx.lista("pagos")).filter((p) => ids.has(p.pedido_id)).forEach((p) => {
    pagosPorEstado[p.estado] = (pagosPorEstado[p.estado] || 0) + 1;
  });

  const reclamosPorTipo = {};
  (await ctx.lista("reclamos")).filter((r) => ids.has(r.pedido_id)).forEach((r) => {
    reclamosPorTipo[r.tipo] = (reclamosPorTipo[r.tipo] || 0) + 1;
  });

  return {
    desde: desde || null,
    hasta: hasta || null,
    total_pedidos: pedidos.length,
    ventas_confirmadas: ventas,
    ticket_promedio: confirmados.length ? Math.round((ventas / confirmados.length) * 100) / 100 : 0,
    por_estado: porEstado,
    pagos: pagosPorEstado,
    reclamos: reclamosPorTipo,
    top_productos: top,
  };
}

async function listarReclamos(ctx) {
  const rs = await ctx.lista("reclamos", {}, { orden: "id DESC" });
  const pedidos = await ctx.lista("pedidos");
  return rs.map((r) => {
    const p = pedidos.find((x) => x.id === r.pedido_id);
    return { ...r, pedido_codigo: p ? p.codigo || "#" + p.id : null, cliente: p ? parsear(p.cliente, {}).nombre : null };
  });
}

// ---------------------------------------------------------------- Esquema
const ESQUEMA = [
  "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'usuarios') CREATE TABLE usuarios (" +
    "id INT IDENTITY(1,1) PRIMARY KEY, usuario NVARCHAR(30) NOT NULL UNIQUE, nombre NVARCHAR(100) NOT NULL, " +
    "rol NVARCHAR(20) NOT NULL, clave_hash NVARCHAR(300) NOT NULL, activo BIT NOT NULL DEFAULT 1, " +
    "creado DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())",
  "IF COL_LENGTH('productos','stock') IS NULL ALTER TABLE productos ADD stock NVARCHAR(MAX) NULL",
  "IF COL_LENGTH('pedidos','estado') IS NULL ALTER TABLE pedidos ADD estado NVARCHAR(20) NOT NULL CONSTRAINT DF_pedidos_estado DEFAULT 'PENDIENTE'",
  "IF COL_LENGTH('pedidos','codigo') IS NULL ALTER TABLE pedidos ADD codigo NVARCHAR(20) NULL",
  "IF COL_LENGTH('pedidos','reserva_vence') IS NULL ALTER TABLE pedidos ADD reserva_vence VARCHAR(19) NULL",
  "IF COL_LENGTH('pedidos','comprobante_tipo') IS NULL ALTER TABLE pedidos ADD comprobante_tipo NVARCHAR(20) NULL",
  "IF COL_LENGTH('pedidos','comprobante_numero') IS NULL ALTER TABLE pedidos ADD comprobante_numero NVARCHAR(40) NULL",
  "IF COL_LENGTH('pedidos','entrega_tipo') IS NULL ALTER TABLE pedidos ADD entrega_tipo NVARCHAR(20) NULL",
  "IF COL_LENGTH('pedidos','entrega_fecha') IS NULL ALTER TABLE pedidos ADD entrega_fecha VARCHAR(19) NULL",
  "IF COL_LENGTH('pedidos','entrega_responsable') IS NULL ALTER TABLE pedidos ADD entrega_responsable NVARCHAR(100) NULL",
  "UPDATE pedidos SET estado = CASE estado WHEN 'recibido' THEN 'ENTREGADO' ELSE 'PENDIENTE' END WHERE estado IN ('pendiente','recibido')",
  "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_pedidos_codigo' AND object_id = OBJECT_ID('pedidos')) CREATE UNIQUE INDEX UX_pedidos_codigo ON pedidos(codigo) WHERE codigo IS NOT NULL",
  `IF OBJECT_ID('pagos','U') IS NULL CREATE TABLE pagos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    pedido_id INT NOT NULL,
    medio NVARCHAR(30) NOT NULL,
    referencia NVARCHAR(60) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    estado NVARCHAR(20) NOT NULL,
    fecha VARCHAR(19) NOT NULL,
    validado_por NVARCHAR(50) NULL,
    validado_fecha VARCHAR(19) NULL,
    nota NVARCHAR(300) NULL)`,
  "IF COL_LENGTH('pagos','tiene_voucher') IS NULL ALTER TABLE pagos ADD tiene_voucher BIT NOT NULL CONSTRAINT DF_pagos_voucher DEFAULT 0",
  "IF OBJECT_ID('vouchers','U') IS NULL CREATE TABLE vouchers (id INT IDENTITY(1,1) PRIMARY KEY, pago_id INT NOT NULL, imagen NVARCHAR(MAX) NOT NULL)",
  `IF OBJECT_ID('reservas','U') IS NULL CREATE TABLE reservas (
    id INT IDENTITY(1,1) PRIMARY KEY,
    pedido_id INT NOT NULL,
    producto_id INT NOT NULL,
    talla NVARCHAR(20) NOT NULL,
    cantidad INT NOT NULL,
    estado NVARCHAR(20) NOT NULL)`,
  `IF OBJECT_ID('historial_estado','U') IS NULL CREATE TABLE historial_estado (
    id INT IDENTITY(1,1) PRIMARY KEY,
    pedido_id INT NOT NULL,
    estado_anterior NVARCHAR(20) NULL,
    estado_nuevo NVARCHAR(20) NOT NULL,
    usuario NVARCHAR(50) NOT NULL,
    fecha VARCHAR(19) NOT NULL,
    nota NVARCHAR(300) NULL)`,
  `IF OBJECT_ID('reclamos','U') IS NULL CREATE TABLE reclamos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    codigo NVARCHAR(20) NOT NULL,
    pedido_id INT NOT NULL,
    tipo NVARCHAR(30) NOT NULL,
    motivo NVARCHAR(500) NOT NULL,
    estado NVARCHAR(20) NOT NULL,
    responsable NVARCHAR(100) NOT NULL,
    fecha VARCHAR(19) NOT NULL,
    resuelto_fecha VARCHAR(19) NULL,
    nota NVARCHAR(500) NULL,
    producto_id INT NULL,
    talla NVARCHAR(20) NULL,
    cantidad INT NULL,
    reingresado INT NOT NULL DEFAULT 0)`,
  `IF OBJECT_ID('configuracion','U') IS NULL CREATE TABLE configuracion (
    clave NVARCHAR(50) PRIMARY KEY,
    valor NVARCHAR(MAX) NULL)`,
];

async function asegurarEsquema(ctx) {
  for (const q of ESQUEMA) await ctx.ejecutar(q);
}

module.exports = {
  ErrorNegocio, ESTADOS_PEDIDO, MEDIOS_PAGO, TIPOS_RECLAMO, ESQUEMA,
  setReloj, ahora, sumarMinutos, mapearPedido,
  leerConfig, guardarConfig, anotarDisponibilidad,
  crearPedido, vencerReservas, listarPedidos, detallePedido, seguimiento,
  registrarPago, leerVoucher, extenderReserva, exportarPedidosCsv, resolverPago, cambiarEstado, registrarComprobante, registrarEntrega,
  crearReclamo, actualizarReclamo, listarReclamos, reportes, asegurarEsquema,
};
