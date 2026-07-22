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

module.exports = { enviarConsultaContacto };
