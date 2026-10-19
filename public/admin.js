(function () {
  "use strict";

  const STORAGE_KEY = "admin_password"; // guardado solo en sessionStorage (se borra al cerrar la pestaña)

  // Redimensiona y comprime una imagen antes de convertirla a base64, para
  // que las fotos del celular (que pueden pesar varios MB) no hagan pesado
  // el formulario ni se acerquen al límite del servidor.
  function leerImagenComprimida(archivo, maxAncho = 1000, calidad = 0.82) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
        img.onload = () => {
          const escala = Math.min(1, maxAncho / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", calidad));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  const loginScreen = document.getElementById("login-screen");
  const dashboard = document.getElementById("dashboard");
  const passwordInput = document.getElementById("password-input");
  const btnLogin = document.getElementById("btn-login");
  const loginError = document.getElementById("login-error");
  const btnLogout = document.getElementById("btn-logout");
  const btnRefrescar = document.getElementById("btn-refrescar");
  const buscarInput = document.getElementById("buscar-input");

  const estadoCarga = document.getElementById("estado-carga");
  const estadoVacio = document.getElementById("estado-vacio");
  const tabla = document.getElementById("tabla-pedidos");
  const tbody = document.getElementById("tbody-pedidos");

  const statTotalPedidos = document.getElementById("stat-total-pedidos");
  const statTotalVentas = document.getElementById("stat-total-ventas");
  const statTicketPromedio = document.getElementById("stat-ticket-promedio");

  let pedidosCache = [];

  function formatearMoneda(valor) {
    return "S/ " + Number(valor).toFixed(2);
  }

  function formatearFecha(iso) {
    // El valor ya viene calculado en hora de Lima desde el servidor.
    // Se muestran los componentes tal cual, sin aplicar ninguna conversión
    // de huso horario adicional (evita desfases si el navegador está en otra zona).
    const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!match) return iso;
    const [, anio, mes, dia, hora, min] = match;
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const horaNum = parseInt(hora, 10);
    const ampm = horaNum >= 12 ? "p. m." : "a. m.";
    const hora12 = ((horaNum + 11) % 12) + 1;
    return `${dia} ${meses[parseInt(mes, 10) - 1]} ${anio}, ${hora12}:${min} ${ampm}`;
  }

  function getClave() {
    return sessionStorage.getItem(STORAGE_KEY);
  }

  async function cargarPedidos() {
    const clave = getClave();
    if (!clave) return mostrarLogin();

    estadoCarga.style.display = "block";
    estadoVacio.style.display = "none";
    tabla.style.display = "none";

    try {
      const resp = await fetch("/api/pedidos", {
        headers: { "x-admin-password": clave },
      });

      if (resp.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        mostrarLogin("Sesión expirada o contraseña incorrecta. Ingresa de nuevo.");
        return;
      }

      if (!resp.ok) throw new Error("Error del servidor: " + resp.status);

      const pedidos = await resp.json();
      pedidosCache = Array.isArray(pedidos) ? pedidos : [];
      renderizarStats(pedidosCache);
      renderizarTabla(pedidosCache);
    } catch (err) {
      estadoCarga.textContent = "No se pudo cargar el historial: " + err.message;
    }
  }

  function renderizarStats(pedidos) {
    const totalVentas = pedidos.reduce((sum, p) => sum + Number(p.total || 0), 0);
    const promedio = pedidos.length ? totalVentas / pedidos.length : 0;

    statTotalPedidos.textContent = pedidos.length;
    statTotalVentas.textContent = formatearMoneda(totalVentas);
    statTicketPromedio.textContent = formatearMoneda(promedio);
  }

  function renderizarTabla(pedidos) {
    const filtro = buscarInput.value.trim().toLowerCase();

    const filtrados = pedidos.filter((p) => {
      if (!filtro) return true;
      const c = p.cliente || {};
      return (
        (c.nombre || "").toLowerCase().includes(filtro) ||
        (c.email || "").toLowerCase().includes(filtro) ||
        (c.telefono || "").toLowerCase().includes(filtro)
      );
    });

    estadoCarga.style.display = "none";

    if (filtrados.length === 0) {
      estadoVacio.style.display = "block";
      tabla.style.display = "none";
      return;
    }

    estadoVacio.style.display = "none";
    tabla.style.display = "table";

    const ordenados = [...filtrados].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    tbody.innerHTML = ordenados.map((p) => {
      const c = p.cliente || {};
      const items = Array.isArray(p.items) ? p.items : [];
      const itemsHtml = items
        .map((it) => `<div>${it.cantidad}× ${escaparHtml(it.nombre)} (talla ${escaparHtml(String(it.talla))}, ${escaparHtml(it.color)})</div>`)
        .join("");

      return `
        <tr>
          <td>#${p.id}</td>
          <td>${formatearFecha(p.fecha)}</td>
          <td>
            <div class="cliente-nombre">${escaparHtml(c.nombre || "—")}</div>
            <div class="cliente-detalle">${escaparHtml(c.telefono || "")}</div>
            <div class="cliente-detalle">${escaparHtml(c.email || "")}</div>
          </td>
          <td class="items-list">${itemsHtml}</td>
          <td class="total-cell">${formatearMoneda(p.total)}</td>
        </tr>
      `;
    }).join("");
  }

  function escaparHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function mostrarLogin(mensaje) {
    loginScreen.style.display = "flex";
    dashboard.style.display = "none";
    loginError.textContent = mensaje || "";
    passwordInput.value = "";
    passwordInput.focus();
  }

  function mostrarDashboard() {
    loginScreen.style.display = "none";
    dashboard.style.display = "block";
    cargarPedidos();
  }

  btnLogin.addEventListener("click", async () => {
    const clave = passwordInput.value.trim();
    if (!clave) return;

    loginError.textContent = "Verificando...";
    btnLogin.disabled = true;

    try {
      const resp = await fetch("/api/pedidos", {
        headers: { "x-admin-password": clave },
      });

      if (resp.status === 401) {
        loginError.textContent = "Contraseña incorrecta.";
        btnLogin.disabled = false;
        return;
      }
      if (!resp.ok) throw new Error("Error del servidor: " + resp.status);

      sessionStorage.setItem(STORAGE_KEY, clave);
      mostrarDashboard();
    } catch (err) {
      loginError.textContent = "No se pudo verificar: " + err.message;
    } finally {
      btnLogin.disabled = false;
    }
  });

  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnLogin.click();
  });

  btnLogout.addEventListener("click", () => {
    sessionStorage.removeItem(STORAGE_KEY);
    mostrarLogin();
  });

  btnRefrescar.addEventListener("click", cargarPedidos);
  buscarInput.addEventListener("input", () => renderizarTabla(pedidosCache));

  // ==================================================================
  // Tabs
  // ==================================================================
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "tab-modelos" && productosCache.length === 0) {
        cargarProductos();
      }
      if (btn.dataset.tab === "tab-stock") cargarProductos();
    });
  });

  // ==================================================================
  // Modelos (productos)
  // ==================================================================
  const formModelo = document.getElementById("form-modelo");
  const mfCodigo = document.getElementById("mf-codigo");
  const mfNombre = document.getElementById("mf-nombre");
  const mfTipo = document.getElementById("mf-tipo");
  const mfPrecio = document.getElementById("mf-precio");
  const mfTag = document.getElementById("mf-tag");
  const mfTallas = document.getElementById("mf-tallas");
  const mfDescripcion = document.getElementById("mf-descripcion");
  const mfImagen = document.getElementById("mf-imagen");
  const mfImagenPreview = document.getElementById("mf-imagen-preview");
  const coloresLista = document.getElementById("colores-lista");
  const mfColorHex = document.getElementById("mf-color-hex");
  const mfColorNombre = document.getElementById("mf-color-nombre");
  const mfColorImagen = document.getElementById("mf-color-imagen");
  const mfColorImagenPreview = document.getElementById("mf-color-imagen-preview");
  const mfColorImagenTexto = document.getElementById("mf-color-imagen-texto");
  const btnAgregarColor = document.getElementById("btn-agregar-color");
  const btnGuardarModelo = document.getElementById("btn-guardar-modelo");
  const btnCancelarEdicion = document.getElementById("btn-cancelar-edicion");
  const modeloMensaje = document.getElementById("modelo-mensaje");
  const modeloFormTitulo = document.getElementById("modelo-form-titulo");
  const productosEstadoCarga = document.getElementById("productos-estado-carga");
  const productosGrid = document.getElementById("productos-grid");

  let productosCache = [];
  let coloresActuales = [];
  let colorImagenPendiente = "";
  let imagenBase64Actual = "";
  let editandoId = null;

  function renderizarColores() {
    coloresLista.innerHTML = coloresActuales.map((c, i) => `
      <span class="color-chip">
        ${c.imagen
          ? `<img class="swatch" src="${escaparHtml(c.imagen)}" alt="">`
          : `<span class="swatch" style="background:${escaparHtml(c.hex)}"></span>`}
        ${escaparHtml(c.nombre)}
        <button type="button" data-i="${i}" aria-label="Quitar color">✕</button>
      </span>
    `).join("");

    coloresLista.querySelectorAll("button[data-i]").forEach((btn) => {
      btn.addEventListener("click", () => {
        coloresActuales.splice(Number(btn.dataset.i), 1);
        renderizarColores();
      });
    });
  }

  mfColorImagen.addEventListener("change", async () => {
    const archivo = mfColorImagen.files[0];
    if (!archivo) return;
    mfColorImagenTexto.textContent = "Procesando...";
    try {
      colorImagenPendiente = await leerImagenComprimida(archivo);
      mfColorImagenPreview.src = colorImagenPendiente;
      mfColorImagenTexto.textContent = "Foto ✓";
    } catch (err) {
      mfColorImagenTexto.textContent = "+ Foto";
      alert("No se pudo procesar la imagen: " + err.message);
    }
  });

  function limpiarPickerImagenColor() {
    colorImagenPendiente = "";
    mfColorImagen.value = "";
    mfColorImagenPreview.src = "";
    mfColorImagenTexto.textContent = "+ Foto";
  }

  btnAgregarColor.addEventListener("click", () => {
    const nombre = mfColorNombre.value.trim();
    if (!nombre) {
      mfColorNombre.focus();
      return;
    }
    coloresActuales.push({ nombre, hex: mfColorHex.value, imagen: colorImagenPendiente || "" });
    mfColorNombre.value = "";
    limpiarPickerImagenColor();
    renderizarColores();
  });

  mfColorNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnAgregarColor.click();
    }
  });

  mfImagen.addEventListener("change", async () => {
    const archivo = mfImagen.files[0];
    if (!archivo) return;
    try {
      imagenBase64Actual = await leerImagenComprimida(archivo, 1200, 0.85);
      mfImagenPreview.src = imagenBase64Actual;
    } catch (err) {
      alert("No se pudo procesar la imagen: " + err.message);
    }
  });

  // ---- Stock dentro del formulario de modelos ----
  const stockActivar = document.getElementById("mf-stock-activar");
  const stockCampos = document.getElementById("mf-stock-campos");
  let stockFormActual = null;

  function tallasDelForm() {
    return mfTallas.value.split(",").map((t) => t.trim()).filter(Boolean);
  }

  function renderizarStockForm() {
    if (!stockActivar.checked) { stockCampos.innerHTML = ""; return; }
    // conserva lo ya escrito al cambiar las tallas
    stockCampos.querySelectorAll("input[data-talla]").forEach((i) => {
      stockFormActual = stockFormActual || {};
      stockFormActual[i.dataset.talla] = i.value;
    });
    stockCampos.innerHTML = tallasDelForm().map((t) => `
      <label>Talla ${escaparHtml(t)}
        <input type="number" min="0" step="1" data-talla="${escaparHtml(t)}" value="${Number((stockFormActual || {})[t]) || 0}">
      </label>`).join("");
  }

  function leerStockForm(tallas) {
    if (!stockActivar.checked) return null;
    const out = {};
    tallas.forEach((t) => {
      const inp = stockCampos.querySelector(`input[data-talla="${CSS.escape(String(t))}"]`);
      out[String(t)] = Math.max(0, Math.floor(Number(inp ? inp.value : 0)) || 0);
    });
    return out;
  }

  stockActivar.addEventListener("change", renderizarStockForm);
  mfTallas.addEventListener("input", renderizarStockForm);

  function limpiarFormularioModelo() {
    formModelo.reset();
    coloresActuales = [];
    imagenBase64Actual = "";
    editandoId = null;
    mfImagenPreview.src = "";
    limpiarPickerImagenColor();
    renderizarColores();
    modeloFormTitulo.textContent = "Nuevo modelo";
    btnGuardarModelo.textContent = "Guardar modelo";
    btnCancelarEdicion.style.display = "none";
    modeloMensaje.textContent = "";
    modeloMensaje.className = "";
    stockFormActual = null;
    stockActivar.checked = false;
    renderizarStockForm();
  }

  btnCancelarEdicion.addEventListener("click", limpiarFormularioModelo);

  async function cargarProductos() {
    productosEstadoCarga.style.display = "block";
    productosGrid.innerHTML = "";
    try {
      const resp = await fetch("/api/productos");
      if (!resp.ok) throw new Error("Error del servidor: " + resp.status);
      const data = await resp.json();
      productosCache = Array.isArray(data.productos) ? data.productos : [];
      renderizarProductos();
      renderizarStock();
    } catch (err) {
      productosEstadoCarga.textContent = "No se pudieron cargar los modelos: " + err.message;
      return;
    }
    productosEstadoCarga.style.display = "none";
  }

  function renderizarProductos() {
    if (productosCache.length === 0) {
      productosGrid.innerHTML = `<p style="color:var(--texto-suave);">Aún no hay modelos cargados.</p>`;
      return;
    }
    productosGrid.innerHTML = productosCache.map((p) => `
      <div class="producto-card">
        <img src="${escaparHtml(p.imagen || "")}" alt="${escaparHtml(p.nombre)}" onerror="this.style.opacity=0.3">
        <div class="info">
          <div class="meta">Cód. ${escaparHtml(p.codigo || "")} · ${escaparHtml(p.tipo)}</div>
          <div class="nombre">${escaparHtml(p.nombre)}</div>
          <div class="precio">S/ ${Number(p.precio).toFixed(2)}</div>
        </div>
        <div class="acciones">
          <button type="button" class="btn-editar" data-id="${p.id}">Editar</button>
          <button type="button" class="btn-borrar" data-id="${p.id}">Eliminar</button>
        </div>
      </div>
    `).join("");

    productosGrid.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => cargarModeloEnFormulario(Number(btn.dataset.id)));
    });
    productosGrid.querySelectorAll(".btn-borrar").forEach((btn) => {
      btn.addEventListener("click", () => borrarModelo(Number(btn.dataset.id)));
    });
  }

  function cargarModeloEnFormulario(id) {
    const p = productosCache.find((x) => x.id === id);
    if (!p) return;

    editandoId = id;
    mfCodigo.value = p.codigo || "";
    mfNombre.value = p.nombre || "";
    mfTipo.value = p.tipo || "";
    mfPrecio.value = p.precio || "";
    mfTag.value = p.tag || "";
    mfTallas.value = Array.isArray(p.tallas) ? p.tallas.join(",") : "";
    stockFormActual = p.stock ? { ...p.stock } : null;
    stockActivar.checked = Boolean(p.stock);
    renderizarStockForm();
    mfDescripcion.value = p.descripcion || "";
    coloresActuales = Array.isArray(p.colores) ? p.colores.map((c) => ({ ...c })) : [];
    imagenBase64Actual = p.imagen || "";
    mfImagenPreview.src = imagenBase64Actual;
    limpiarPickerImagenColor();
    renderizarColores();

    modeloFormTitulo.textContent = "Editando: " + p.nombre;
    btnGuardarModelo.textContent = "Actualizar modelo";
    btnCancelarEdicion.style.display = "inline-block";
    modeloMensaje.textContent = "";
    modeloMensaje.className = "";

    document.querySelector('.tab-btn[data-tab="tab-modelos"]').click();
    formModelo.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function borrarModelo(id) {
    const p = productosCache.find((x) => x.id === id);
    if (!p) return;
    if (!confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;

    try {
      const resp = await fetch(`/api/productos/${id}`, {
        method: "DELETE",
        headers: { "x-admin-password": getClave() },
      });
      if (resp.status === 401) {
        alert("Sesión expirada. Vuelve a iniciar sesión.");
        sessionStorage.removeItem(STORAGE_KEY);
        mostrarLogin();
        return;
      }
      if (!resp.ok) throw new Error("Error del servidor: " + resp.status);
      await cargarProductos();
      if (editandoId === id) limpiarFormularioModelo();
    } catch (err) {
      alert("No se pudo eliminar: " + err.message);
    }
  }

  formModelo.addEventListener("submit", async (e) => {
    e.preventDefault();
    modeloMensaje.textContent = "";
    modeloMensaje.className = "";

    const tallas = mfTallas.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (isNaN(Number(t)) ? t : Number(t)));

    if (!imagenBase64Actual) {
      modeloMensaje.textContent = "Selecciona una imagen para el modelo.";
      modeloMensaje.className = "error";
      return;
    }
    if (tallas.length === 0) {
      modeloMensaje.textContent = "Ingresa al menos una talla.";
      modeloMensaje.className = "error";
      return;
    }

    const payload = {
      codigo: mfCodigo.value.trim(),
      nombre: mfNombre.value.trim(),
      tipo: mfTipo.value,
      precio: Number(mfPrecio.value),
      tag: mfTag.value || null,
      descripcion: mfDescripcion.value.trim(),
      colores: coloresActuales,
      tallas,
      imagen: imagenBase64Actual,
      stock: leerStockForm(tallas),
    };

    btnGuardarModelo.disabled = true;
    btnGuardarModelo.textContent = editandoId ? "Actualizando..." : "Guardando...";

    try {
      const url = editandoId ? `/api/productos/${editandoId}` : "/api/productos";
      const metodo = editandoId ? "PUT" : "POST";
      const resp = await fetch(url, {
        method: metodo,
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": getClave(),
        },
        body: JSON.stringify(payload),
      });

      if (resp.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        modeloMensaje.textContent = "Sesión expirada. Vuelve a iniciar sesión.";
        modeloMensaje.className = "error";
        mostrarLogin();
        return;
      }
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || "Error del servidor: " + resp.status);
      }

      modeloMensaje.textContent = editandoId ? "Modelo actualizado correctamente." : "Modelo creado correctamente.";
      modeloMensaje.className = "exito";
      await cargarProductos();
      limpiarFormularioModelo();
    } catch (err) {
      modeloMensaje.textContent = "No se pudo guardar: " + err.message;
      modeloMensaje.className = "error";
    } finally {
      btnGuardarModelo.disabled = false;
      btnGuardarModelo.textContent = editandoId ? "Actualizar modelo" : "Guardar modelo";
    }
  });

  // ==================================================================
  // Pestaña Stock
  // ==================================================================
  const UMBRAL_BAJO = 3;
  const stockLista = document.getElementById("stock-lista");
  const stockBuscar = document.getElementById("stock-buscar");
  const stockFiltro = document.getElementById("stock-filtro");
  const stockMensaje = document.getElementById("stock-mensaje");

  function msgStock(texto, error) {
    stockMensaje.textContent = texto || "";
    stockMensaje.style.color = error ? "#a32d2d" : "#1e6b34";
    if (texto) setTimeout(() => { if (stockMensaje.textContent === texto) stockMensaje.textContent = ""; }, 3500);
  }

  function estadoStock(p) {
    if (!p.stock) return "sin";
    const v = (p.tallas || []).map((t) => Number(p.stock[String(t)]) || 0);
    if (v.length && v.every((n) => n === 0)) return "agotado";
    if (v.some((n) => n === 0)) return "bajo";
    if (v.some((n) => n <= UMBRAL_BAJO)) return "bajo";
    return "ok";
  }

  function renderizarStock() {
    let unidades = 0, bajo = 0, agotados = 0;
    productosCache.forEach((p) => {
      const e = estadoStock(p);
      if (p.stock) unidades += Object.values(p.stock).reduce((a, b) => a + (Number(b) || 0), 0);
      if (e === "bajo") bajo++;
      if (e === "agotado") agotados++;
    });
    document.getElementById("st-modelos").textContent = productosCache.length;
    document.getElementById("st-unidades").textContent = unidades;
    document.getElementById("st-bajo").textContent = bajo;
    document.getElementById("st-agotado").textContent = agotados;

    const q = stockBuscar.value.trim().toLowerCase();
    const filtro = stockFiltro.value;
    const lista = productosCache.filter((p) => {
      if (q && !(`${p.nombre} ${p.codigo || ""} ${p.tipo}`.toLowerCase().includes(q))) return false;
      const e = estadoStock(p);
      if (filtro === "bajo") return e === "bajo" || e === "agotado";
      if (filtro === "agotado") return p.stock && (p.tallas || []).some((t) => !(Number(p.stock[String(t)]) > 0));
      if (filtro === "sin") return e === "sin";
      return true;
    });

    if (lista.length === 0) {
      stockLista.innerHTML = `<p style="color:var(--texto-suave);">No hay modelos para mostrar.</p>`;
      return;
    }

    const etiquetas = { ok: "En stock", bajo: "Stock bajo", agotado: "Agotado", sin: "Sin control" };
    stockLista.innerHTML = lista.map((p) => {
      const e = estadoStock(p);
      const tallasHtml = p.stock
        ? (p.tallas || []).map((t) => {
            const n = Number(p.stock[String(t)]) || 0;
            const cls = n === 0 ? "cero" : n <= UMBRAL_BAJO ? "bajo" : "";
            return `<div class="stock-talla ${cls}">${escaparHtml(String(t))}
              <div class="ctl">
                <button type="button" data-accion="menos" data-id="${p.id}" data-talla="${escaparHtml(String(t))}">−</button>
                <input type="number" min="0" step="1" value="${n}" data-id="${p.id}" data-talla="${escaparHtml(String(t))}" data-orig="${n}">
                <button type="button" data-accion="mas" data-id="${p.id}" data-talla="${escaparHtml(String(t))}">+</button>
              </div></div>`;
          }).join("")
        : `<span style="font-size:0.85rem; color:var(--texto-suave);">Este modelo siempre aparece disponible. Actívalo para controlar las unidades por talla.</span>`;
      const total = p.stock ? Object.values(p.stock).reduce((a, b) => a + (Number(b) || 0), 0) : null;
      return `<div class="stock-fila">
        <img src="${escaparHtml(p.imagen || "")}" alt="" onerror="this.style.opacity=0.3">
        <div class="stock-info">
          <div class="stock-nombre">${escaparHtml(p.nombre)}</div>
          <div class="stock-meta">Cód. ${escaparHtml(p.codigo || "")} · ${escaparHtml(p.tipo)}${total !== null ? " · " + total + " uds." : ""}</div>
          <div class="stock-tallas">${tallasHtml}</div>
        </div>
        <div class="stock-lado">
          <span class="badge-stock ${e === "ok" ? "" : e}">${etiquetas[e]}</span>
          ${p.stock
            ? `<button type="button" class="btn-secundario" data-accion="quitar" data-id="${p.id}">Quitar control</button>`
            : `<button type="button" class="btn-dorado" data-accion="activar" data-id="${p.id}">Activar control</button>`}
        </div>
      </div>`;
    }).join("");
  }

  async function llamarStock(id, metodo, cuerpo) {
    const resp = await fetch(`/api/productos/${id}/stock`, {
      method: metodo,
      headers: { "Content-Type": "application/json", "x-admin-password": getClave() },
      body: JSON.stringify(cuerpo),
    });
    if (resp.status === 401) {
      sessionStorage.removeItem(STORAGE_KEY);
      mostrarLogin("Sesión expirada. Vuelve a iniciar sesión.");
      throw new Error("Sesión expirada");
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "Error del servidor: " + resp.status);
    return data;
  }

  function reemplazarProducto(nuevo) {
    const i = productosCache.findIndex((x) => x.id === nuevo.id);
    if (i >= 0) productosCache[i] = nuevo;
    renderizarStock();
  }

  stockLista.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-accion]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const p = productosCache.find((x) => x.id === id);
    if (!p) return;
    try {
      if (btn.dataset.accion === "mas" || btn.dataset.accion === "menos") {
        const delta = btn.dataset.accion === "mas" ? 1 : -1;
        const actual = Number((p.stock || {})[btn.dataset.talla]) || 0;
        if (delta < 0 && actual === 0) return;
        reemplazarProducto(await llamarStock(id, "PATCH", { talla: btn.dataset.talla, delta }));
      } else if (btn.dataset.accion === "activar") {
        const txt = prompt(`Unidades iniciales por talla para "${p.nombre}" (puedes cambiarlas luego):`, "0");
        if (txt === null) return;
        const n = Math.max(0, Math.floor(Number(txt)) || 0);
        const stock = {};
        (p.tallas || []).forEach((t) => (stock[String(t)] = n));
        reemplazarProducto(await llamarStock(id, "PUT", { stock }));
        msgStock("Control de stock activado.");
      } else if (btn.dataset.accion === "quitar") {
        if (!confirm(`¿Quitar el control de stock de "${p.nombre}"? Quedará siempre disponible.`)) return;
        reemplazarProducto(await llamarStock(id, "PUT", { stock: null }));
        msgStock("Control de stock quitado.");
      }
    } catch (err) {
      msgStock("No se pudo actualizar: " + err.message, true);
      renderizarStock();
    }
  });

  stockLista.addEventListener("change", async (ev) => {
    const inp = ev.target.closest("input[data-talla]");
    if (!inp) return;
    const id = Number(inp.dataset.id);
    const n = Math.max(0, Math.floor(Number(inp.value)) || 0);
    try {
      reemplazarProducto(await llamarStock(id, "PATCH", { talla: inp.dataset.talla, cantidad: n }));
      msgStock("Stock guardado.");
    } catch (err) {
      msgStock("No se pudo guardar: " + err.message, true);
      renderizarStock();
    }
  });

  stockBuscar.addEventListener("input", renderizarStock);
  stockFiltro.addEventListener("change", renderizarStock);
  document.getElementById("stock-refrescar").addEventListener("click", cargarProductos);

  // Al cargar la página: si ya hay clave guardada en esta pestaña, entra directo
  if (getClave()) {
    mostrarDashboard();
  } else {
    mostrarLogin();
  }
})();
