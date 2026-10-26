(function () {
  "use strict";

  // Mensajes del formulario web "Escríbenos": consultas, cambios, reclamos y pedidos personalizados.
  const A = () => window.AdminCtx;
  const esc = (t) => A().escaparHtml(t);
  const $ = (id) => document.getElementById(id);

  const ETIQUETA_TIPO = {
    consulta: "Consulta",
    cambio: "Cambio",
    reclamo: "Reclamo",
    personalizado: "Pedido personalizado",
  };
  const ETIQUETA_ESTADO = {
    NUEVO: "Nuevo",
    EN_CONTACTO: "En contacto",
    RESUELTO: "Atendido",
    DESCARTADO: "Descartado",
  };
  const ICONO_MSG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>';

  let mensajes = [];
  // Filtros de cada pestaña.
  const filtros = {
    mensajes: { tipo: "todos", estado: "abiertos" },
    personalizados: { estado: "abiertos" },
  };

  async function api(metodo, url, cuerpo) {
    const resp = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json", "x-admin-password": A().getClave() },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (resp.status === 401) {
      A().cerrarSesion("Sesión expirada. Ingresa de nuevo.");
      throw new Error("Sesión expirada");
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "Error del servidor: " + resp.status);
    return data;
  }

  function badge(estado) {
    return `<span class="badge-estado ${esc(estado)}">${esc(ETIQUETA_ESTADO[estado] || estado)}</span>`;
  }

  // ---- Contacto: WhatsApp (abre el chat con el mensaje armado) y correo
  function telefonoWa(t) {
    const d = String(t || "").replace(/\D/g, "");
    if (d.length === 9) return "51" + d;
    return d.length >= 10 ? d : "";
  }
  function textoRespuesta(m) {
    const nombre = String(m.nombre || "").split(" ")[0] || "";
    const hola = `Hola ${nombre}, te escribimos de Calzados Paredes.`;
    switch (m.tipo) {
      case "personalizado":
        return `${hola} Recibimos tu solicitud de pedido personalizado (${m.codigo}). Queremos conversar los detalles contigo.`;
      case "cambio":
        return `${hola} Recibimos tu solicitud de cambio${m.pedido_codigo ? " del pedido " + m.pedido_codigo : ""} (${m.codigo}). Te ayudamos con gusto.`;
      case "reclamo":
        return `${hola} Recibimos tu reclamo${m.pedido_codigo ? " sobre el pedido " + m.pedido_codigo : ""} (${m.codigo}) y queremos resolverlo lo antes posible.`;
      default:
        return `${hola} Recibimos tu consulta (${m.codigo}). Te respondemos por aquí.`;
    }
  }
  function enlaceWa(m) {
    const tel = telefonoWa(m.telefono);
    return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(textoRespuesta(m))}` : "";
  }
  function enlaceCorreo(m) {
    const asunto = `${ETIQUETA_TIPO[m.tipo] || "Consulta"} ${m.codigo} · Calzados Paredes`;
    return `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(textoRespuesta(m) + "\n\n")}`;
  }

  // ---- Detalle de un pedido personalizado
  function detallePersonalizado(m) {
    const d = m.detalle || {};
    const filas = [["Modelo de referencia", d.modelo], ["Color", d.color], ["Talla", d.talla], ["Cantidad", d.cantidad]]
      .filter(([, v]) => v);
    if (!filas.length) return "";
    return `<div class="msg-extra">${filas.map(([k, v]) => `<div><span>${esc(k)}:</span> ${esc(v)}</div>`).join("")}</div>`;
  }

  function filaMensaje(m) {
    const wa = enlaceWa(m);
    const cerrado = ["RESUELTO", "DESCARTADO"].includes(m.estado);
    const pedido = m.pedido_codigo
      ? `<div class="msg-extra"><div><span>Pedido:</span> ${esc(m.pedido_codigo)}${m.pedido_encontrado ? ` <em>(${esc(m.pedido_estado)})</em>` : ' <em>(no encontrado)</em>'}</div></div>`
      : "";
    return `<tr>
      <td>${esc(m.codigo)}<div class="msg-sub">${A().formatearFecha(m.fecha)}</div><div class="msg-tipo ${esc(m.tipo)}">${esc(ETIQUETA_TIPO[m.tipo] || m.tipo)}</div></td>
      <td><div class="cliente-nombre">${esc(m.nombre)}</div>
        <div class="msg-sub">${m.telefono ? esc(m.telefono) + "<br>" : ""}${esc(m.email)}</div></td>
      <td><div class="msg-texto">${esc(m.mensaje)}</div>${pedido}${m.tipo === "personalizado" ? detallePersonalizado(m) : ""}
        ${m.nota ? `<div class="msg-nota">Nota: ${esc(m.nota)}${m.atendido_por ? ` — ${esc(m.atendido_por)}` : ""}</div>` : ""}</td>
      <td>${badge(m.estado)}</td>
      <td class="msg-acciones">
        <div class="msg-contacto">
          ${wa ? `<a class="btn-wa" target="_blank" rel="noopener" href="${wa}">${ICONO_MSG}<span>WhatsApp</span></a>` : '<span class="msg-sub">Sin WhatsApp válido</span>'}
          <a class="btn-wa" href="${enlaceCorreo(m)}"><span>Correo</span></a>
        </div>
        <div class="msg-estados">
          ${m.estado === "NUEVO" ? `<button class="btn-mini sec" data-mid="${m.id}" data-e="EN_CONTACTO">En contacto</button>` : ""}
          ${cerrado ? `<button class="btn-mini sec" data-mid="${m.id}" data-e="NUEVO">Reabrir</button>`
            : `<button class="btn-mini" data-mid="${m.id}" data-e="RESUELTO">Marcar atendido</button>
               <button class="btn-mini peligro" data-mid="${m.id}" data-e="DESCARTADO">Descartar</button>`}
        </div>
      </td>
    </tr>`;
  }

  function pasaEstado(m, filtro) {
    if (filtro === "todos") return true;
    if (filtro === "cerrados") return ["RESUELTO", "DESCARTADO"].includes(m.estado);
    return ["NUEVO", "EN_CONTACTO"].includes(m.estado); // abiertos
  }

  function selectorEstado(clave) {
    const v = filtros[clave].estado;
    const op = (valor, txt) => `<option value="${valor}"${v === valor ? " selected" : ""}>${txt}</option>`;
    return `<select class="msg-filtro-estado" data-clave="${clave}">${op("abiertos", "Por atender")}${op("cerrados", "Atendidos / descartados")}${op("todos", "Todos")}</select>`;
  }

  function pintarMensajes() {
    const cont = $("mensajes-lista");
    if (!cont) return;
    const base = mensajes.filter((m) => m.tipo !== "personalizado");
    const f = filtros.mensajes;
    const nuevos = (t) => base.filter((m) => m.estado === "NUEVO" && (t === "todos" || m.tipo === t)).length;
    const chip = (t, txt) => `<button type="button" class="estado-chip${f.tipo === t ? " active" : ""}" data-tipo="${t}">${txt} <span>${nuevos(t)}</span></button>`;
    const lista = base.filter((m) => (f.tipo === "todos" || m.tipo === f.tipo) && pasaEstado(m, f.estado));
    cont.innerHTML = `
      <div class="estado-tabs">${chip("todos", "Todos")}${chip("consulta", "Consultas")}${chip("cambio", "Cambios")}${chip("reclamo", "Reclamos")}</div>
      <div class="toolbar">${selectorEstado("mensajes")}<span class="msg-sub">El número en cada filtro indica los mensajes nuevos.</span></div>
      ${tabla(lista, "No hay mensajes en esta vista.")}`;
  }

  function pintarPersonalizados() {
    const cont = $("personalizados-lista");
    if (!cont) return;
    const base = mensajes.filter((m) => m.tipo === "personalizado");
    const lista = base.filter((m) => pasaEstado(m, filtros.personalizados.estado));
    cont.innerHTML = `
      <div class="toolbar">${selectorEstado("personalizados")}</div>
      ${tabla(lista, "No hay pedidos personalizados en esta vista.")}`;
  }

  function tabla(lista, vacio) {
    if (!lista.length) return `<p class="msg-vacio">${esc(vacio)}</p>`;
    return `<table class="tabla-simple tabla-mensajes"><thead><tr>
      <th>Código</th><th>Cliente</th><th>Mensaje</th><th>Estado</th><th></th>
    </tr></thead><tbody>${lista.map(filaMensaje).join("")}</tbody></table>`;
  }

  function actualizarContadores() {
    const nuevos = (fn) => mensajes.filter((m) => m.estado === "NUEVO" && fn(m)).length;
    const poner = (id, n) => {
      const el = $(id);
      if (!el) return;
      el.textContent = n > 0 ? n : "";
      el.style.display = n > 0 ? "inline-block" : "none";
    };
    poner("cnt-mensajes", nuevos((m) => m.tipo !== "personalizado"));
    poner("cnt-personalizados", nuevos((m) => m.tipo === "personalizado"));
  }

  async function cargar() {
    for (const id of ["mensajes-lista", "personalizados-lista"]) {
      const c = $(id);
      if (c && !mensajes.length) c.innerHTML = "<p>Cargando...</p>";
    }
    try {
      mensajes = await api("GET", "/api/mensajes");
      actualizarContadores();
      pintarMensajes();
      pintarPersonalizados();
    } catch (err) {
      for (const id of ["mensajes-lista", "personalizados-lista"]) {
        const c = $(id);
        if (c) c.innerHTML = `<p>${esc(err.message)}</p>`;
      }
    }
  }

  // ---- Eventos
  document.addEventListener("click", async (ev) => {
    const chip = ev.target.closest("#mensajes-lista [data-tipo]");
    if (chip) {
      filtros.mensajes.tipo = chip.dataset.tipo;
      pintarMensajes();
      return;
    }
    const b = ev.target.closest("[data-mid]");
    if (!b) return;
    const estado = b.dataset.e;
    let nota;
    if (estado === "RESUELTO" || estado === "DESCARTADO") {
      nota = prompt(estado === "RESUELTO" ? "Nota de cierre (opcional):" : "Motivo (opcional):", "");
      if (nota === null) return;
    }
    b.disabled = true;
    try {
      const body = { estado };
      if (nota !== undefined) body.nota = nota;
      await api("PATCH", "/api/mensajes/" + b.dataset.mid, body);
      await cargar();
    } catch (err) {
      alert(err.message);
      b.disabled = false;
    }
  });

  document.addEventListener("change", (ev) => {
    const sel = ev.target.closest(".msg-filtro-estado");
    if (!sel) return;
    filtros[sel.dataset.clave].estado = sel.value;
    if (sel.dataset.clave === "mensajes") pintarMensajes();
    else pintarPersonalizados();
  });

  document.addEventListener("admin:tab", (e) => {
    if (e.detail === "tab-mensajes" || e.detail === "tab-personalizados") cargar();
  });
  // Al entrar al panel se cargan los contadores de mensajes nuevos.
  document.addEventListener("admin:listo", (e) => {
    if (e.detail && e.detail.rol !== "gerente") cargar();
  });
  ["mensajes-refrescar", "personalizados-refrescar"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("click", cargar);
  });
})();
