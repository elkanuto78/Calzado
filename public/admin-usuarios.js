(function () {
  "use strict";

  const A = () => window.AdminCtx;
  const esc = (t) => A().escaparHtml(t);
  const $ = (id) => document.getElementById(id);

  const ETIQUETA_ROL = { administrador: "Administrador", vendedor: "Vendedor", gerente: "Gerente" };
  let usuarios = [];
  let editandoId = null;
  let miUsuario = "";

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

  function mensaje(texto, ok) {
    const m = $("us-mensaje");
    m.textContent = texto || "";
    m.className = texto ? (ok ? "exito" : "error") : "";
  }

  function limpiarForm() {
    editandoId = null;
    $("us-form").reset();
    $("us-form-titulo").textContent = "Nuevo usuario";
    $("us-guardar").textContent = "Crear usuario";
    $("us-cancelar").style.display = "none";
    $("us-usuario").disabled = false;
    $("us-clave").required = true;
    $("us-clave-label").textContent = "Contraseña * (mín. 8 caracteres)";
  }

  function cargarEnForm(u) {
    editandoId = u.id;
    $("us-nombre").value = u.nombre;
    $("us-usuario").value = u.usuario;
    $("us-usuario").disabled = true;
    $("us-rol").value = u.rol;
    $("us-clave").value = "";
    $("us-clave").required = false;
    $("us-clave-label").textContent = "Nueva contraseña (déjala vacía para no cambiarla)";
    $("us-form-titulo").textContent = "Editando: " + u.usuario;
    $("us-guardar").textContent = "Guardar cambios";
    $("us-cancelar").style.display = "inline-block";
    mensaje("");
    $("us-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pintar() {
    const cont = $("us-lista");
    const filas = usuarios.map((u) => `
      <div class="us-fila ${u.activo ? "" : "inactivo"}">
        <div class="us-datos">
          <div class="us-nombre">${esc(u.nombre)}</div>
          <div class="us-sub">@${esc(u.usuario)}</div>
        </div>
        <span class="us-rol ${esc(u.rol)}">${esc(ETIQUETA_ROL[u.rol] || u.rol)}</span>
        <span class="us-estado ${u.activo ? "" : "off"}">${u.activo ? "Activo" : "Desactivado"}</span>
        <div class="us-acciones">
          <button type="button" data-acc="editar" data-id="${u.id}">Editar</button>
          ${u.usuario === miUsuario ? "" : `
            <button type="button" data-acc="${u.activo ? "desactivar" : "activar"}" data-id="${u.id}">${u.activo ? "Desactivar" : "Activar"}</button>
            <button type="button" class="peligro" data-acc="eliminar" data-id="${u.id}">Eliminar</button>`}
        </div>
      </div>`).join("");
    cont.innerHTML = `
      <div class="us-fila" style="opacity:.85">
        <div class="us-datos"><div class="us-nombre">Administrador principal</div><div class="us-sub">@admin · usa la contraseña ADMIN_PASSWORD de Render (siempre activo)</div></div>
        <span class="us-rol administrador">Administrador</span><span class="us-estado">Activo</span>
      </div>` + (filas || '<p style="color:var(--texto-suave);margin-top:1rem">Aún no creaste otros usuarios.</p>');
  }

  async function cargar() {
    try {
      usuarios = await api("GET", "/api/usuarios");
      pintar();
    } catch (err) {
      $("us-lista").innerHTML = `<p>${esc(err.message)}</p>`;
    }
  }

  $("us-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("us-guardar");
    btn.disabled = true;
    mensaje("");
    try {
      if (editandoId) {
        const cuerpo = { nombre: $("us-nombre").value, rol: $("us-rol").value };
        if ($("us-clave").value) cuerpo.clave = $("us-clave").value;
        await api("PATCH", `/api/usuarios/${editandoId}`, cuerpo);
        mensaje("Usuario actualizado.", true);
      } else {
        await api("POST", "/api/usuarios", {
          nombre: $("us-nombre").value,
          usuario: $("us-usuario").value,
          rol: $("us-rol").value,
          clave: $("us-clave").value,
        });
        mensaje("Usuario creado. Entrégale su usuario y contraseña.", true);
      }
      limpiarFormTrasGuardar();
      await cargar();
    } catch (err) {
      mensaje(err.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  function limpiarFormTrasGuardar() {
    const texto = $("us-mensaje").textContent;
    const clase = $("us-mensaje").className;
    limpiarForm();
    $("us-mensaje").textContent = texto;
    $("us-mensaje").className = clase;
  }

  $("us-cancelar").addEventListener("click", () => { limpiarForm(); mensaje(""); });

  $("us-lista").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-acc]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const u = usuarios.find((x) => x.id === id);
    if (!u) return;
    try {
      if (btn.dataset.acc === "editar") return cargarEnForm(u);
      if (btn.dataset.acc === "desactivar" || btn.dataset.acc === "activar") {
        const activar = btn.dataset.acc === "activar";
        if (!activar && !confirm(`¿Desactivar a ${u.nombre}? No podrá ingresar al panel.`)) return;
        await api("PATCH", `/api/usuarios/${id}`, { activo: activar });
      } else if (btn.dataset.acc === "eliminar") {
        if (!confirm(`¿Eliminar a ${u.nombre}? Esta acción no se puede deshacer. (Su historial en los pedidos se conserva.)`)) return;
        await api("DELETE", `/api/usuarios/${id}`);
        if (editandoId === id) limpiarForm();
      }
      mensaje("");
      await cargar();
    } catch (err) {
      mensaje(err.message, false);
    }
  });

  document.addEventListener("admin:listo", async () => {
    try {
      const ses = await fetch("/api/sesion", { headers: { "x-admin-password": A().getClave() } }).then((r) => r.json());
      miUsuario = ses.usuario || "";
    } catch (e) {}
  });

  document.addEventListener("admin:tab", (e) => {
    if (e.detail === "tab-usuarios") cargar();
  });
})();
