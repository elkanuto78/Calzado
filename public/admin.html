(function () {
  "use strict";

  const STORAGE_KEY = "admin_password"; // guardado solo en sessionStorage (se borra al cerrar la pestaña)

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
  const btnAgregarColor = document.getElementById("btn-agregar-color");
  const btnGuardarModelo = document.getElementById("btn-guardar-modelo");
  const btnCancelarEdicion = document.getElementById("btn-cancelar-edicion");
  const modeloMensaje = document.getElementById("modelo-mensaje");
  const modeloFormTitulo = document.getElementById("modelo-form-titulo");
  const productosEstadoCarga = document.getElementById("productos-estado-carga");
  const productosGrid = document.getElementById("productos-grid");

  let productosCache = [];
  let coloresActuales = [];
  let imagenBase64Actual = "";
  let editandoId = null;

  function renderizarColores() {
    coloresLista.innerHTML = coloresActuales.map((c, i) => `
      <span class="color-chip">
        <span class="swatch" style="background:${escaparHtml(c.hex)}"></span>
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

  btnAgregarColor.addEventListener("click", () => {
    const nombre = mfColorNombre.value.trim();
    if (!nombre) {
      mfColorNombre.focus();
      return;
    }
    coloresActuales.push({ nombre, hex: mfColorHex.value });
    mfColorNombre.value = "";
    renderizarColores();
  });

  mfColorNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnAgregarColor.click();
    }
  });

  mfImagen.addEventListener("change", () => {
    const archivo = mfImagen.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      imagenBase64Actual = lector.result;
      mfImagenPreview.src = imagenBase64Actual;
    };
    lector.readAsDataURL(archivo);
  });

  function limpiarFormularioModelo() {
    formModelo.reset();
    coloresActuales = [];
    imagenBase64Actual = "";
    editandoId = null;
    mfImagenPreview.src = "";
    renderizarColores();
    modeloFormTitulo.textContent = "Nuevo modelo";
    btnGuardarModelo.textContent = "Guardar modelo";
    btnCancelarEdicion.style.display = "none";
    modeloMensaje.textContent = "";
    modeloMensaje.className = "";
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
    mfDescripcion.value = p.descripcion || "";
    coloresActuales = Array.isArray(p.colores) ? p.colores.map((c) => ({ ...c })) : [];
    imagenBase64Actual = p.imagen || "";
    mfImagenPreview.src = imagenBase64Actual;
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

  // Al cargar la página: si ya hay clave guardada en esta pestaña, entra directo
  if (getClave()) {
    mostrarDashboard();
  } else {
    mostrarLogin();
  }
})();
