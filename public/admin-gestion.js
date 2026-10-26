(function () {
  "use strict";

  const A = () => window.AdminCtx;
  const esc = (t) => A().escaparHtml(t);
  const $ = (id) => document.getElementById(id);

  const ETIQUETA_ESTADO = {
    PENDIENTE: "Pendiente",
    RESERVADO: "Reservado",
    PAGO_VALIDADO: "Pago validado",
    EN_PREPARACION: "En preparación",
    ENTREGADO: "Entregado",
    CANCELADO: "Cancelado",
    POR_VALIDAR: "Por validar",
    VALIDADO: "Validado",
    RECHAZADO: "Rechazado",
    ABIERTO: "Abierto",
    EN_PROCESO: "En proceso",
    RESUELTO: "Resuelto",
  };
  const ETIQUETA_TIPO = {
    cambio_talla: "Cambio de talla",
    devolucion: "Devolución",
    fabricacion_8_dias: "Fabricación en 8 días",
    reclamo: "Reclamo",
  };
  const CONFIRMADOS = ["PAGO_VALIDADO", "EN_PREPARACION", "ENTREGADO"];

  function badge(estado) {
    return `<span class="badge-estado ${esc(estado)}">${esc(ETIQUETA_ESTADO[estado] || estado)}</span>`;
  }

  // Llamada autenticada. Devuelve el JSON o lanza Error con el mensaje del servidor.
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
    if (!resp.ok) {
      const e = new Error(data.error || "Error del servidor: " + resp.status);
      e.data = data;
      throw e;
    }
    return data;
  }

  // ---- WhatsApp (abre el chat con el mensaje armado; no usa ninguna API)
  function telefonoWa(t) {
    const d = String(t || "").replace(/\D/g, "");
    if (d.length === 9) return "51" + d;
    return d.length >= 10 ? d : "";
  }
  function mensajeWa(p) {
    const c = p.cliente || {};
    const nombre = String(c.nombre || "").split(" ")[0] || "";
    const cod = p.codigo || "#" + p.id;
    const total = A().formatearMoneda(p.total);
    const hola = `Hola ${nombre}, te escribimos de Calzados Paredes.`;
    const enRevision = (p.pagos || []).some((x) => x.estado === "POR_VALIDAR");
    const estados = {
      PENDIENTE: `${hola} Recibimos tu pedido ${cod} (${total}).`,
      RESERVADO: enRevision
        ? `${hola} Recibimos tu pago del pedido ${cod} (${total}) y lo estamos validando. Te confirmamos en breve.`
        : `${hola} Tu pedido ${cod} (${total}) está reservado. Para confirmarlo, realiza tu pago e infórmalo en nuestra web con tu código.`,
      PAGO_VALIDADO: `${hola} ¡Tu pago del pedido ${cod} fue confirmado! Pronto lo prepararemos.`,
      EN_PREPARACION: `${hola} Estamos preparando tu pedido ${cod}. Te avisaremos cuando esté listo.`,
      ENTREGADO: `${hola} Tu pedido ${cod} fue entregado. ¡Gracias por tu compra!`,
      CANCELADO: `${hola} Tu pedido ${cod} fue cancelado porque la reserva venció. Si aún lo deseas, puedes hacer un nuevo pedido en nuestra web.`,
    };
    return estados[p.estado] || `${hola} Sobre tu pedido ${cod}:`;
  }
  function enlaceWa(p) {
    const tel = telefonoWa((p.cliente || {}).telefono);
    return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensajeWa(p))}` : "";
  }
  // Icono de mensaje en trazo fino (hereda color desde CSS, sin emoji)
  const ICONO_MSG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>';

  // ---- Orden imprimible (para taller / despacho)
  function imprimirOrden(p) {
    const c = p.cliente || {};
    const filas = (p.items || []).map((it) =>
      `<tr><td>${esc(it.cantidad)}</td><td>${esc(it.nombre)}</td><td>${esc(String(it.talla))}</td><td>${esc(it.color)}</td><td style="text-align:right">${A().formatearMoneda(it.subtotal)}</td></tr>`).join("");
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return alert("Permite las ventanas emergentes para imprimir.");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Orden ${esc(p.codigo || p.id)}</title>
      <style>body{font-family:Arial,sans-serif;color:#222;margin:24px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999}
      table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
      .meta{font-size:13px;line-height:1.6}.firma{margin-top:50px;display:flex;gap:40px}.firma div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:12px;text-align:center}</style></head><body>
      <h1>Calzados Paredes — Orden de despacho</h1>
      <p class="meta"><strong>Pedido:</strong> ${esc(p.codigo || "#" + p.id)} &nbsp; <strong>Fecha:</strong> ${esc(A().formatearFecha(p.fecha))} &nbsp; <strong>Estado:</strong> ${esc(ETIQUETA_ESTADO[p.estado] || p.estado)}</p>
      <h2>Cliente</h2>
      <p class="meta"><strong>${esc(c.nombre || "")}</strong><br>DNI: ${esc(c.dni || "—")} · Tel.: ${esc(c.telefono || "—")}<br>Dirección: ${esc(c.direccion || "—")}${c.nota ? `<br>Nota: ${esc(c.nota)}` : ""}</p>
      <h2>Productos</h2>
      <table><tr><th>Cant.</th><th>Modelo</th><th>Talla</th><th>Color</th><th style="text-align:right">Subtotal</th></tr>${filas}</table>
      <p style="text-align:right;font-size:15px"><strong>Total ${A().formatearMoneda(p.total)}</strong></p>
      <div class="firma"><div>Preparado por</div><div>Recibí conforme</div></div>
      <script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  }

  // ---- Exportar pedidos a CSV (Excel)
  $("ex-boton").addEventListener("click", async () => {
    const qs = new URLSearchParams();
    if ($("ex-desde").value) qs.set("desde", $("ex-desde").value);
    if ($("ex-hasta").value) qs.set("hasta", $("ex-hasta").value);
    try {
      const resp = await fetch("/api/pedidos/exportar?" + qs.toString(), { headers: { "x-admin-password": A().getClave() } });
      if (resp.status === 401) return A().cerrarSesion("Sesión expirada. Ingresa de nuevo.");
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || "Error del servidor: " + resp.status);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pedidos" + (qs.get("desde") ? "_" + qs.get("desde") : "") + (qs.get("hasta") ? "_a_" + qs.get("hasta") : "") + ".csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
      alert("No se pudo exportar: " + err.message);
    }
  });

  // ================================================================ Pedidos
  let pedidos = [];
  let filtroEstado = "por_validar";

  function porValidar(p) {
    return (p.pagos || []).some((x) => x.estado === "POR_VALIDAR");
  }

  function actualizarStats() {
    const confirmados = pedidos.filter((p) => CONFIRMADOS.includes(p.estado));
    const ventas = confirmados.reduce((s, p) => s + p.total, 0);
    $("stat-total-pedidos").textContent = pedidos.length;
    $("stat-total-ventas").textContent = A().formatearMoneda(ventas);
    $("stat-ticket-promedio").textContent = A().formatearMoneda(confirmados.length ? ventas / confirmados.length : 0);
  }

  function renderizarPedidos() {
    const q = $("buscar-input").value.trim().toLowerCase();

    const cuentas = { todos: pedidos.length, por_validar: 0 };
    pedidos.forEach((p) => {
      cuentas[p.estado] = (cuentas[p.estado] || 0) + 1;
      if (porValidar(p)) cuentas.por_validar++;
    });
    document.querySelectorAll("[data-cnt]").forEach((el) => (el.textContent = cuentas[el.dataset.cnt] || 0));

    const lista = pedidos
      .filter((p) => {
        if (filtroEstado === "por_validar") { if (!porValidar(p)) return false; }
        else if (filtroEstado !== "todos" && p.estado !== filtroEstado) return false;
        if (!q) return true;
        const c = p.cliente || {};
        return [p.codigo, "#" + p.id, c.nombre, c.dni, c.telefono, c.email].some((v) => String(v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => b.id - a.id);

    $("estado-carga").style.display = "none";
    if (lista.length === 0) {
      $("estado-vacio").style.display = "block";
      $("estado-vacio").textContent = "No hay pedidos en esta vista.";
      $("tabla-pedidos").style.display = "none";
      return;
    }
    $("estado-vacio").style.display = "none";
    $("tabla-pedidos").style.display = "table";

    $("tbody-pedidos").innerHTML = lista.map((p) => {
      const c = p.cliente || {};
      const items = (p.items || [])
        .map((it) => `<div>${it.cantidad}× ${esc(it.nombre)} (talla ${esc(String(it.talla))}, ${esc(it.color)})</div>`)
        .join("");
      const pago = porValidar(p) ? ' <span class="badge-estado POR_VALIDAR">Pago por validar</span>' : "";
      return `
        <tr>
          <td>${esc(p.codigo || "#" + p.id)}</td>
          <td>${A().formatearFecha(p.fecha)}</td>
          <td>
            <div class="cliente-nombre">${esc(c.nombre || "—")}</div>
            <div class="cliente-detalle">DNI ${esc(c.dni || "—")}</div>
            <div class="cliente-detalle">${esc(c.telefono || "")}</div>
          </td>
          <td class="items-list">${items}</td>
          <td class="total-cell">${A().formatearMoneda(p.total)}</td>
          <td>${badge(p.estado)}${pago}</td>
          <td><button type="button" class="btn-mini" data-gestionar="${p.id}">Gestionar</button>${enlaceWa(p) ? ` <a class="btn-wa mini" target="_blank" rel="noopener" href="${enlaceWa(p)}" title="Enviar mensaje" aria-label="Enviar mensaje por WhatsApp">${ICONO_MSG}</a>` : ""}</td>
        </tr>`;
    }).join("");
  }

  async function cargarPedidos() {
    $("estado-carga").style.display = "block";
    $("estado-carga").textContent = "Cargando pedidos...";
    try {
      pedidos = await api("GET", "/api/pedidos");
      actualizarStats();
      renderizarPedidos();
    } catch (err) {
      $("estado-carga").textContent = "No se pudo cargar el historial: " + err.message;
    }
  }

  document.querySelectorAll(".estado-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filtroEstado = chip.dataset.estado;
      document.querySelectorAll(".estado-chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderizarPedidos();
    });
  });
  $("btn-refrescar").addEventListener("click", cargarPedidos);
  $("buscar-input").addEventListener("input", renderizarPedidos);
  $("tbody-pedidos").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-gestionar]");
    if (b) abrirPedido(Number(b.dataset.gestionar));
  });

  // ================================================================ Modal de pedido
  const modal = $("modal-pedido");
  const caja = $("modal-pedido-caja");
  let pedidoAbierto = null;

  function cerrarModal() {
    modal.hidden = true;
    caja.innerHTML = "";
    pedidoAbierto = null;
  }
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrarModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) cerrarModal(); });

  async function abrirPedido(id) {
    modal.hidden = false;
    caja.innerHTML = '<p style="padding:1rem">Cargando...</p>';
    try {
      pedidoAbierto = await api("GET", "/api/pedidos/" + id);
      renderizarModal();
    } catch (err) {
      caja.innerHTML = `<button class="modal-cerrar" data-cerrar>&times;</button><p style="padding:1rem">${esc(err.message)}</p>`;
    }
  }

  function renderizarModal(mensajeError) {
    const p = pedidoAbierto;
    const rol = A().rol();
    const esAdmin = rol === "administrador";
    const c = p.cliente || {};
    const hayPorValidar = p.pagos.some((x) => x.estado === "POR_VALIDAR");

    const items = (p.items || []).map((it) =>
      `<div>${it.cantidad}× ${esc(it.nombre)} <span style="color:var(--texto-suave)">(talla ${esc(String(it.talla))}, ${esc(it.color)})</span> — ${A().formatearMoneda(it.subtotal)}</div>`
    ).join("");

    const pagos = p.pagos.length
      ? p.pagos.map((x) => `
        <div class="mp-pago">
          <div>
            ${badge(x.estado)} <strong>${esc(x.medio)}</strong> · ${esc(x.referencia)} · ${A().formatearMoneda(x.monto)}
            <div style="font-size:0.78rem;color:var(--texto-suave)">Informado ${A().formatearFecha(x.fecha)}${x.validado_por ? ` · ${esc(x.validado_por)} ${A().formatearFecha(x.validado_fecha)}` : ""}${x.nota ? ` · ${esc(x.nota)}` : ""}</div>
            ${x.tiene_voucher
              ? `<button type="button" class="btn-mini" style="margin-top:6px" data-voucher="${x.id}">📎 Ver voucher</button>`
              : '<div style="font-size:0.78rem;color:var(--texto-suave)">Sin voucher adjunto</div>'}
            ${x.duplicada ? '<div class="mp-aviso">⚠ Otro pago usa la misma referencia. Revísalo antes de validar.</div>' : ""}
            ${x.estado === "POR_VALIDAR" && Math.abs(x.monto - p.total) > 0.009 ? `<div class="mp-aviso">⚠ El monto (${A().formatearMoneda(x.monto)}) no coincide con el total del pedido.</div>` : ""}
          </div>
          ${x.estado === "POR_VALIDAR" && esAdmin ? `
            <div class="mp-fila">
              <button type="button" class="btn-mini" data-pago="${x.id}" data-res="VALIDADO" data-dup="${x.duplicada ? 1 : 0}">Validar</button>
              <button type="button" class="btn-mini peligro" data-pago="${x.id}" data-res="RECHAZADO">Rechazar</button>
            </div>` : x.estado === "POR_VALIDAR" ? '<span style="font-size:0.78rem;color:var(--texto-suave)">Solo Administración valida pagos</span>' : ""}
        </div>`).join("")
      : '<p style="font-size:0.88rem;color:var(--texto-suave)">Aún no se informó ningún pago.</p>';

    const puedeRegistrarPago = ["PENDIENTE", "RESERVADO"].includes(p.estado) && !hayPorValidar;
    const formPago = puedeRegistrarPago ? `
      <div class="mp-fila" style="margin-top:0.6rem">
        <select id="np-medio"><option>Yape</option><option>Plin</option><option>Transferencia</option><option>Depósito</option><option>Otro</option></select>
        <input type="text" id="np-ref" maxlength="40" placeholder="Código de operación / boleta del depósito">
        <button type="button" class="btn-mini" id="np-guardar">Registrar pago informado</button>
      </div>` : "";

    let acciones = "";
    if (p.estado === "PAGO_VALIDADO") acciones += '<button type="button" class="btn-mini" data-estado="EN_PREPARACION">Autorizar despacho (pasar a preparación)</button> ';
    if (["PENDIENTE", "RESERVADO"].includes(p.estado) && !hayPorValidar) acciones += '<button type="button" class="btn-mini peligro" data-estado="CANCELADO">Cancelar pedido</button>';
    if (p.estado === "RESERVADO" && p.reserva_vence && !hayPorValidar) acciones += ` <button type="button" class="btn-mini sec" data-extender="1">⏱ Extender reserva</button> <span style="font-size:0.8rem;color:var(--texto-suave)">La reserva vence ${A().formatearFecha(p.reserva_vence)}</span>`;

    const compr = CONFIRMADOS.includes(p.estado) ? `
      <div class="mp-seccion">
        <h3>Comprobante</h3>
        ${p.comprobante ? `<p style="font-size:0.9rem">Registrado: <strong>${esc(p.comprobante.tipo)} ${esc(p.comprobante.numero)}</strong></p>` : ""}
        ${esAdmin ? `<div class="mp-fila">
          <select id="cp-tipo"><option value="boleta">Boleta</option><option value="factura">Factura</option></select>
          <input type="text" id="cp-num" maxlength="30" placeholder="Ej. B001-00012345" value="${esc(p.comprobante ? p.comprobante.numero : "")}">
          <button type="button" class="btn-mini" id="cp-guardar">${p.comprobante ? "Actualizar" : "Registrar"} comprobante</button>
        </div><p style="font-size:0.78rem;color:var(--texto-suave);margin:4px 0 0">Se registra la referencia del comprobante emitido fuera del sistema (SUNAT).</p>` : '<p style="font-size:0.8rem;color:var(--texto-suave)">Solo Administración registra comprobantes.</p>'}
      </div>` : "";

    const entrega = p.estado === "EN_PREPARACION" ? `
      <div class="mp-seccion">
        <h3>Registrar entrega o retiro</h3>
        <div class="mp-fila">
          <select id="en-tipo"><option value="entrega">Entrega</option><option value="retiro">Retiro en tienda</option></select>
          <input type="text" id="en-resp" maxlength="100" placeholder="Responsable">
          <input type="datetime-local" id="en-fecha" title="Vacío = ahora">
          <button type="button" class="btn-mini" id="en-guardar">Marcar entregado</button>
        </div>
      </div>` : p.entrega ? `
      <div class="mp-seccion"><h3>Entrega</h3>
        <p style="font-size:0.9rem">${esc(p.entrega.tipo === "retiro" ? "Retiro" : "Entrega")} · ${A().formatearFecha(p.entrega.fecha)} · responsable: ${esc(p.entrega.responsable)}</p></div>` : "";

    const opcionesItems = (p.items || []).map((it, i) =>
      `<option value="${i}">${esc(it.nombre)} (talla ${esc(String(it.talla))}) ×${it.cantidad}</option>`).join("");
    const incidencia = CONFIRMADOS.includes(p.estado) ? `
      <div class="mp-seccion">
        <h3>Cambios, devoluciones y reclamos</h3>
        ${p.reclamos.map((r) => `<div class="mp-pago"><div>${badge(r.estado)} <strong>${esc(r.codigo)}</strong> · ${esc(ETIQUETA_TIPO[r.tipo] || r.tipo)} — ${esc(r.motivo)}</div><span style="font-size:0.78rem;color:var(--texto-suave)">${esc(r.responsable)}</span></div>`).join("")}
        <div class="mp-fila" style="margin-top:0.6rem">
          <select id="rc-tipo">${Object.entries(ETIQUETA_TIPO).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
          <select id="rc-item"><option value="">Pedido completo</option>${opcionesItems}</select>
          <input type="text" id="rc-motivo" maxlength="500" placeholder="Motivo">
          <input type="text" id="rc-resp" maxlength="100" placeholder="Responsable">
          <button type="button" class="btn-mini" id="rc-guardar">Registrar incidencia</button>
        </div>
      </div>` : "";

    const hist = p.historial.map((h) =>
      `<li>${A().formatearFecha(h.fecha)} · <strong>${esc(ETIQUETA_ESTADO[h.estado_nuevo] || h.estado_nuevo)}</strong> · ${esc(h.usuario)}${h.nota ? " — " + esc(h.nota) : ""}</li>`).join("");

    caja.innerHTML = `
      <button class="modal-cerrar" data-cerrar>&times;</button>
      <div class="mp-titulo"><h2>${esc(p.codigo || "Pedido #" + p.id)}</h2>${badge(p.estado)}<span style="color:var(--texto-suave);font-size:0.85rem">${A().formatearFecha(p.fecha)}</span></div>
      <div class="mp-herramientas">
        ${enlaceWa(p) ? `<a class="btn-wa" target="_blank" rel="noopener" href="${enlaceWa(p)}">${ICONO_MSG}<span>Enviar mensaje</span></a>` : '<span style="font-size:0.8rem;color:var(--texto-suave)">Sin teléfono válido para WhatsApp</span>'}
        <button type="button" class="btn-mini sec" data-imprimir="1">🖨 Imprimir orden</button>
      </div>
      <div class="mp-seccion">
        <h3>Cliente</h3>
        <div class="mp-datos">
          <div><span>Nombre</span><br>${esc(c.nombre || "—")}</div>
          <div><span>DNI</span><br>${esc(c.dni || "—")}</div>
          <div><span>Teléfono</span><br>${esc(c.telefono || "—")}</div>
          <div><span>Correo</span><br>${esc(c.email || "—")}</div>
          <div><span>Dirección</span><br>${esc(c.direccion || "—")}</div>
          ${c.nota ? `<div><span>Nota</span><br>${esc(c.nota)}</div>` : ""}
        </div>
      </div>
      <div class="mp-seccion">
        <h3>Productos</h3>
        ${items}
        <div style="text-align:right;margin-top:0.4rem"><strong>Total ${A().formatearMoneda(p.total)}</strong></div>
      </div>
      <div class="mp-seccion">
        <h3>Pagos</h3>
        ${pagos}
        ${formPago}
      </div>
      ${acciones ? `<div class="mp-seccion"><h3>Acciones</h3><div class="mp-fila">${acciones}</div></div>` : ""}
      ${compr}
      ${entrega}
      ${incidencia}
      <div class="mp-seccion"><h3>Historial</h3><ul class="mp-hist">${hist || "<li>Sin movimientos</li>"}</ul></div>
      <div class="mp-error" id="mp-error">${esc(mensajeError || "")}</div>`;
  }

  async function accionPedido(fn) {
    try {
      await fn();
      pedidoAbierto = await api("GET", "/api/pedidos/" + pedidoAbierto.id);
      renderizarModal();
      cargarPedidos();
    } catch (err) {
      const el = $("mp-error");
      if (el) el.textContent = err.message;
    }
  }

  caja.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (t.closest("[data-cerrar]")) return cerrarModal();
    const p = pedidoAbierto;
    if (!p) return;

    if (t.closest("[data-imprimir]")) return imprimirOrden(p);
    if (t.closest("[data-extender]")) {
      const txt = prompt("¿Cuántos minutos extender la reserva? (5 a 1440)", "60");
      if (txt === null) return;
      return accionPedido(() => api("PATCH", `/api/pedidos/${p.id}/reserva`, { minutos: Number(txt) }));
    }

    const bVoucher = t.closest("[data-voucher]");
    if (bVoucher) {
      try {
        const r = await api("GET", "/api/pagos/" + bVoucher.dataset.voucher + "/voucher");
        $("visor-img").src = r.voucher;
        $("visor").hidden = false;
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    const bPago = t.closest("[data-pago]");
    if (bPago) {
      const resultado = bPago.dataset.res;
      let nota = null;
      let confirmarDuplicada = false;
      if (resultado === "RECHAZADO") {
        nota = prompt("Motivo del rechazo (opcional):", "");
        if (nota === null) return;
      } else {
        if (bPago.dataset.dup === "1" && !confirm("Esta referencia ya aparece en otro pago. ¿Confirmas que corresponde a este pedido?")) return;
        confirmarDuplicada = bPago.dataset.dup === "1";
        if (!confirm("¿Confirmas que el pago llegó y coincide con el total? Se descontará el stock reservado.")) return;
      }
      return accionPedido(() => api("PATCH", "/api/pagos/" + bPago.dataset.pago, { resultado, nota, confirmarDuplicada }));
    }

    const bEstado = t.closest("[data-estado]");
    if (bEstado) {
      const nuevo = bEstado.dataset.estado;
      if (nuevo === "CANCELADO" && !confirm("¿Cancelar el pedido? Se libera el stock reservado.")) return;
      return accionPedido(() => api("PATCH", `/api/pedidos/${p.id}/estado`, { estado: nuevo }));
    }

    if (t.id === "np-guardar") {
      return accionPedido(() => api("POST", `/api/pedidos/${p.id}/pagos`, { medio: $("np-medio").value, referencia: $("np-ref").value }));
    }
    if (t.id === "cp-guardar") {
      return accionPedido(() => api("PATCH", `/api/pedidos/${p.id}/comprobante`, { tipo: $("cp-tipo").value, numero: $("cp-num").value }));
    }
    if (t.id === "en-guardar") {
      return accionPedido(() => api("POST", `/api/pedidos/${p.id}/entrega`, {
        tipo: $("en-tipo").value, responsable: $("en-resp").value, fecha: $("en-fecha").value || undefined,
      }));
    }
    if (t.id === "rc-guardar") {
      const idx = $("rc-item").value;
      const it = idx === "" ? null : p.items[Number(idx)];
      return accionPedido(() => api("POST", "/api/reclamos", {
        pedido_id: p.id, tipo: $("rc-tipo").value, motivo: $("rc-motivo").value, responsable: $("rc-resp").value,
        producto_id: it ? it.id : undefined, talla: it ? it.talla : undefined, cantidad: it ? it.cantidad : undefined,
      }));
    }
  });

  // ================================================================ Reclamos
  async function cargarReclamos() {
    const cont = $("reclamos-lista");
    cont.innerHTML = "<p>Cargando...</p>";
    try {
      const lista = await api("GET", "/api/reclamos");
      if (!lista.length) { cont.innerHTML = '<p style="color:var(--texto-suave)">Aún no hay incidencias registradas.</p>'; return; }
      cont.innerHTML = `<table class="tabla-simple"><thead><tr><th>Código</th><th>Pedido</th><th>Tipo</th><th>Motivo</th><th>Responsable</th><th>Estado</th><th></th></tr></thead><tbody>
        ${lista.map((r) => `<tr>
          <td>${esc(r.codigo)}<div style="font-size:0.75rem;color:var(--texto-suave)">${A().formatearFecha(r.fecha)}</div></td>
          <td>${esc(r.pedido_codigo || "")}<div style="font-size:0.75rem;color:var(--texto-suave)">${esc(r.cliente || "")}</div></td>
          <td>${esc(ETIQUETA_TIPO[r.tipo] || r.tipo)}${r.producto_id ? `<div style="font-size:0.75rem;color:var(--texto-suave)">Talla ${esc(r.talla)} ×${r.cantidad}</div>` : ""}</td>
          <td>${esc(r.motivo)}${r.nota ? `<div style="font-size:0.75rem;color:var(--texto-suave)">${esc(r.nota)}</div>` : ""}</td>
          <td>${esc(r.responsable)}</td>
          <td>${badge(r.estado)}${r.reingresado ? '<div style="font-size:0.72rem;color:#1e6b34">Stock reingresado</div>' : ""}</td>
          <td>${["RESUELTO", "RECHAZADO"].includes(r.estado) ? "" : `
            ${r.estado === "ABIERTO" ? `<button class="btn-mini sec" data-rc="${r.id}" data-e="EN_PROCESO">En proceso</button> ` : ""}
            <button class="btn-mini" data-rc="${r.id}" data-e="RESUELTO" data-stock="${r.producto_id ? 1 : 0}">Resolver</button>
            <button class="btn-mini peligro" data-rc="${r.id}" data-e="RECHAZADO">Rechazar</button>`}</td>
        </tr>`).join("")}</tbody></table>`;
    } catch (err) {
      cont.innerHTML = `<p>${esc(err.message)}</p>`;
    }
  }

  $("reclamos-lista").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-rc]");
    if (!b) return;
    const estado = b.dataset.e;
    let nota = null;
    let reingresar = false;
    if (estado !== "EN_PROCESO") {
      nota = prompt("Nota de cierre (opcional):", "");
      if (nota === null) return;
    }
    if (estado === "RESUELTO" && b.dataset.stock === "1") {
      reingresar = confirm("¿El calzado vuelve al stock? Aceptar = reingresar las unidades al inventario.");
    }
    try {
      await api("PATCH", "/api/reclamos/" + b.dataset.rc, { estado, nota, reingresar_stock: reingresar });
      cargarReclamos();
    } catch (err) {
      alert(err.message);
    }
  });

  // ================================================================ Reportes
  async function cargarReporte() {
    const cont = $("rep-contenido");
    cont.innerHTML = "<p>Cargando...</p>";
    const qs = new URLSearchParams();
    if ($("rep-desde").value) qs.set("desde", $("rep-desde").value);
    if ($("rep-hasta").value) qs.set("hasta", $("rep-hasta").value);
    try {
      const r = await api("GET", "/api/reportes?" + qs.toString());
      const filasEstado = Object.entries(r.por_estado)
        .map(([e, v]) => `<tr><td>${esc(ETIQUETA_ESTADO[e] || e)}</td><td>${v.cantidad} · ${A().formatearMoneda(v.total)}</td></tr>`).join("");
      const filasPagos = Object.entries(r.pagos).map(([e, n]) => `<tr><td>${esc(ETIQUETA_ESTADO[e] || e)}</td><td>${n}</td></tr>`).join("");
      const filasRec = Object.entries(r.reclamos).map(([e, n]) => `<tr><td>${esc(ETIQUETA_TIPO[e] || e)}</td><td>${n}</td></tr>`).join("") || '<tr><td colspan="2" style="color:var(--texto-suave)">Sin incidencias</td></tr>';
      const filasTop = r.top_productos.map((t) => `<tr><td>${esc(t.nombre)}</td><td>${t.cantidad} uds.</td></tr>`).join("") || '<tr><td colspan="2" style="color:var(--texto-suave)">Sin ventas confirmadas</td></tr>';
      cont.innerHTML = `
        <div class="stats" style="margin-bottom:0">
          <div class="stat-card"><div class="valor">${r.total_pedidos}</div><div class="etiqueta">Pedidos</div></div>
          <div class="stat-card"><div class="valor">${A().formatearMoneda(r.ventas_confirmadas)}</div><div class="etiqueta">Ventas confirmadas</div></div>
          <div class="stat-card"><div class="valor">${A().formatearMoneda(r.ticket_promedio)}</div><div class="etiqueta">Ticket promedio</div></div>
        </div>
        <div class="rep-grid">
          <div class="rep-caja"><h3>Pedidos por estado</h3><table>${filasEstado}</table></div>
          <div class="rep-caja"><h3>Pagos</h3><table>${filasPagos}</table></div>
          <div class="rep-caja"><h3>Cambios y reclamos</h3><table>${filasRec}</table></div>
          <div class="rep-caja"><h3>Más vendidos</h3><table>${filasTop}</table></div>
        </div>`;
    } catch (err) {
      cont.innerHTML = `<p>${esc(err.message)}</p>`;
    }
  }
  $("rep-aplicar").addEventListener("click", cargarReporte);

  // ================================================================ Ajustes
  let qrActual = { yape: "", plin: "" };
  function pintarQr() {
    for (const k of ["yape", "plin"]) {
      const img = $("aj-qr-" + k);
      img.src = qrActual[k] || "";
      img.style.display = qrActual[k] ? "block" : "none";
      $("aj-qr-" + k + "-quitar").style.display = qrActual[k] ? "inline-block" : "none";
      $("aj-qr-" + k + "-txt").textContent = qrActual[k] ? "Cambiar imagen" : "Subir imagen del QR";
    }
  }
  for (const k of ["yape", "plin"]) {
    $("aj-qr-" + k + "-file").addEventListener("change", async (ev) => {
      const archivo = ev.target.files[0];
      ev.target.value = "";
      if (!archivo) return;
      try {
        qrActual[k] = await A().comprimirImagen(archivo, 640, 0.9);
        pintarQr();
      } catch (err) {
        alert("No se pudo procesar la imagen: " + err.message);
      }
    });
    $("aj-qr-" + k + "-quitar").addEventListener("click", () => { qrActual[k] = ""; pintarQr(); });
  }
  $("visor").addEventListener("click", () => { $("visor").hidden = true; $("visor-img").src = ""; });

  async function cargarAjustes() {
    try {
      const cfg = await fetch("/api/config").then((r) => r.json());
      $("aj-minutos").value = cfg.minutos_reserva;
      $("aj-instrucciones").value = cfg.instrucciones_pago || "";
      qrActual = { yape: (cfg.qr && cfg.qr.yape) || "", plin: (cfg.qr && cfg.qr.plin) || "" };
      pintarQr();
    } catch (e) {}
  }
  $("aj-guardar").addEventListener("click", async () => {
    const m = $("aj-mensaje");
    try {
      await api("PUT", "/api/config", { minutos_reserva: $("aj-minutos").value, instrucciones_pago: $("aj-instrucciones").value, qr_yape: qrActual.yape, qr_plin: qrActual.plin });
      m.textContent = "Ajustes guardados.";
      m.className = "exito";
    } catch (err) {
      m.textContent = err.message;
      m.className = "error";
    }
  });

  // ================================================================ Arranque
  document.addEventListener("admin:tab", (e) => {
    if (e.detail === "tab-reclamos") cargarReclamos();
    if (e.detail === "tab-reportes") cargarReporte();
    if (e.detail === "tab-ajustes") cargarAjustes();
    if (e.detail === "tab-pedidos" && A().rol() !== "gerente") cargarPedidos();
  });
})();
