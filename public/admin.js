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

  // Al cargar la página: si ya hay clave guardada en esta pestaña, entra directo
  if (getClave()) {
    mostrarDashboard();
  } else {
    mostrarLogin();
  }
})();
