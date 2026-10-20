const nodemailer = require("nodemailer");

// Dirección que recibe las consultas del formulario de "Contáctanos".
// Se puede sobreescribir con la variable de entorno CONTACT_EMAIL_TO si
// en algún momento se quiere cambiar sin tocar el código.
const DESTINO_CONTACTO = process.env.CONTACT_EMAIL_TO || "masakisebastian2@gmail.com";

let transporter = null;

function obtenerTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null; // No configurado: se avisa en consola al intentar enviar
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Contraseña de aplicación de Gmail, no la contraseña normal
    },
  });

  return transporter;
}

// Envía la consulta del formulario de contacto de la tienda al correo
// configurado. Lanza un error si no se pudo enviar (el caller decide
// cómo responder al cliente).
async function enviarConsultaContacto({ nombre, email, telefono, mensaje }) {
  const t = obtenerTransporter();
  if (!t) {
    throw new Error(
      "El envío de correo no está configurado: faltan las variables de entorno EMAIL_USER / EMAIL_PASS"
    );
  }

  await t.sendMail({
    from: `"Calzados Paredes - Web" <${process.env.EMAIL_USER}>`,
    to: DESTINO_CONTACTO,
    replyTo: email,
    subject: `Nueva consulta de ${nombre} · Calzados Paredes`,
    text: [
      `Nombre: ${nombre}`,
      `Correo: ${email}`,
      `Teléfono: ${telefono || "(no proporcionado)"}`,
      "",
      "Mensaje:",
      mensaje,
    ].join("\n"),
    html: `
      <div style="font-family: sans-serif; font-size: 15px; color: #333;">
        <h2 style="color:#3f2601;">Nueva consulta desde la web</h2>
        <p><strong>Nombre:</strong> ${escaparHtml(nombre)}</p>
        <p><strong>Correo:</strong> ${escaparHtml(email)}</p>
        <p><strong>Teléfono:</strong> ${escaparHtml(telefono || "(no proporcionado)")}</p>
        <p><strong>Mensaje:</strong></p>
        <p style="white-space: pre-wrap;">${escaparHtml(mensaje)}</p>
      </div>
    `,
  });
}

function escaparHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Avisa a la tienda que un cliente informó un pago por validar. Nunca lanza:
// si el correo no está configurado o falla, solo lo registra en consola.
async function enviarAvisoPago({ codigo, cliente, total, medio, referencia, tieneVoucher, urlPanel }) {
  const t = obtenerTransporter();
  if (!t) {
    console.warn("Aviso de pago no enviado: faltan EMAIL_USER / EMAIL_PASS");
    return;
  }
  try {
    await t.sendMail({
      from: `"Calzados Paredes - Web" <${process.env.EMAIL_USER}>`,
      to: DESTINO_CONTACTO,
      subject: `Pago por validar · ${codigo} · S/ ${Number(total).toFixed(2)}`,
      text: [
        `Un cliente informó su pago y está esperando validación.`,
        ``,
        `Pedido: ${codigo}`,
        `Cliente: ${cliente.nombre} (${cliente.telefono || "sin teléfono"})`,
        `Total: S/ ${Number(total).toFixed(2)}`,
        `Medio: ${medio}`,
        `Código de operación: ${referencia}`,
        `Voucher adjunto: ${tieneVoucher ? "sí" : "no"}`,
        ``,
        `Valídalo en el panel: ${urlPanel}`,
      ].join("\n"),
      html: `
        <div style="font-family: sans-serif; font-size: 15px; color: #333;">
          <h2 style="color:#3f2601;">Pago por validar</h2>
          <p><strong>Pedido:</strong> ${escaparHtml(codigo)}</p>
          <p><strong>Cliente:</strong> ${escaparHtml(cliente.nombre)} (${escaparHtml(cliente.telefono || "sin teléfono")})</p>
          <p><strong>Total:</strong> S/ ${Number(total).toFixed(2)}</p>
          <p><strong>Medio:</strong> ${escaparHtml(medio)} · <strong>Operación:</strong> ${escaparHtml(referencia)}</p>
          <p><strong>Voucher adjunto:</strong> ${tieneVoucher ? "sí" : "no"}</p>
          <p><a href="${escaparHtml(urlPanel)}" style="background:#c9a84c;color:#3f2601;padding:10px 18px;border-radius:6px;text-decoration:none;">Abrir el panel</a></p>
        </div>`,
    });
  } catch (e) {
    console.error("No se pudo enviar el aviso de pago:", e.message);
  }
}

module.exports = { enviarConsultaContacto, enviarAvisoPago };
