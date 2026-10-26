let PRODUCTOS = [];

let estado = {
  filtroCategoria: "todos",
  filtroTalla: "",
  textoBusqueda: "",
  ordenamiento: "default",
  vistaActual: "grid",
  productoActual: null,
  tallaSeleccionada: null,
  colorSeleccionado: null,
  imgIndexActual: 0,
  carrito: [],
  favoritos: [],
};

document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/productos")
    .then((r) => r.json())
    .then((data) => {
      PRODUCTOS = data.productos;
      llenarTallas();
      renderProductos();
    })
    .catch(() => mostrarToast("Error al cargar los productos"));

  try {
    const guardado = localStorage.getItem("cp_pedido");
    if (guardado) mostrarChipPedido(guardado);
  } catch (e) {}

  iniciarScrollEvents();
  iniciarAnimacionEstadisticas();
  iniciarNavActiva();
});

// ---- Stock ----
// producto.stock = { talla: unidades } o null (sin control => siempre disponible)
// producto.disponible = unidades que se pueden pedir ahora (stock − reservas)
function stockDeTalla(p, talla) {
  if (!p || !p.stock) return Infinity;
  const fuente = p.disponible || p.stock; // disponible = stock físico − reservas activas
  const n = Number(fuente[String(talla)]);
  return Number.isFinite(n) ? n : 0;
}

function productoAgotado(p) {
  return Boolean(p && p.stock) && (p.tallas || []).every((t) => stockDeTalla(p, t) <= 0);
}

function unidadesEnCarrito(id, talla) {
  return estado.carrito
    .filter((c) => c.id === id && String(c.talla) === String(talla))
    .reduce((s, c) => s + c.cantidad, 0);
}

function recargarProductos() {
  return fetch("/api/productos")
    .then((r) => r.json())
    .then((data) => {
      PRODUCTOS = data.productos;
      llenarTallas();
      renderProductos();
    })
    .catch(() => {});
}

function filterProducts() {
  const input = document.getElementById("searchInput");
  estado.filtroCategoria = "todos";
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  document.querySelector('.chip[data-cat="todos"]').classList.add("active");
  estado.textoBusqueda = input.value.trim().toLowerCase();
  renderProductos();
}

function setCategory(chipEl) {
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  chipEl.classList.add("active");
  estado.filtroCategoria = chipEl.dataset.cat;
  estado.textoBusqueda = "";
  document.getElementById("searchInput").value = "";
  renderProductos();
}

function sortProducts() {
  estado.ordenamiento = document.getElementById("sortSelect").value;
  renderProductos();
}

function setView(vista) {
  estado.vistaActual = vista;
  const grid = document.getElementById("productsGrid");
  if (vista === "list") {
    grid.classList.add("list-view");
    document.getElementById("btnList").classList.add("active");
    document.getElementById("btnGrid").classList.remove("active");
  } else {
    grid.classList.remove("list-view");
    document.getElementById("btnGrid").classList.add("active");
    document.getElementById("btnList").classList.remove("active");
  }
}

function llenarTallas() {
  const sel = document.getElementById("tallaSelect");
  if (!sel) return;
  const actual = sel.value;
  const tallas = [...new Set(PRODUCTOS.flatMap((p) => (p.tallas || []).map(String)))].sort(
    (a, b) => Number(a) - Number(b) || a.localeCompare(b)
  );
  sel.innerHTML = '<option value="">Todas</option>' + tallas.map((t) => `<option value="${t}">${t}</option>`).join("");
  sel.value = tallas.includes(actual) ? actual : "";
  estado.filtroTalla = sel.value;
}

function filtrarTalla(valor) {
  estado.filtroTalla = valor;
  renderProductos();
}

function renderProductos() {
  let lista = [...PRODUCTOS];

  if (estado.filtroTalla) {
    lista = lista.filter(
      (p) => (p.tallas || []).map(String).includes(estado.filtroTalla) && stockDeTalla(p, estado.filtroTalla) > 0
    );
  }

  if (estado.filtroCategoria !== "todos") {
    lista = lista.filter((p) => p.tipo === estado.filtroCategoria);
  }

  if (estado.textoBusqueda) {
    lista = lista.filter(
      (p) =>
        p.nombre.toLowerCase().includes(estado.textoBusqueda) ||
        p.descripcion.toLowerCase().includes(estado.textoBusqueda)
    );
  }

  switch (estado.ordenamiento) {
    case "precio-asc":
      lista.sort((a, b) => a.precio - b.precio);
      break;
    case "precio-desc":
      lista.sort((a, b) => b.precio - a.precio);
      break;
    case "nombre":
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      break;
  }

  const grid = document.getElementById("productsGrid");
  const noResults = document.getElementById("noResults");
  const countNum = document.getElementById("countNum");

  if (lista.length === 0) {
    grid.innerHTML = "";
    noResults.classList.remove("hidden");
    countNum.textContent = "0";
  } else {
    noResults.classList.add("hidden");
    countNum.textContent = lista.length;
    grid.innerHTML = lista.map((p, i) => crearTarjeta(p, i)).join("");
    if (estado.vistaActual === "list") grid.classList.add("list-view");
  }
}

function crearTarjeta(producto, index) {
  const esFavorito = estado.favoritos.includes(producto.id);
  const agotado = productoAgotado(producto);
  const tagHtml = agotado
    ? `<span class="product-tag agotado">Agotado</span>`
    : producto.tag
    ? `<span class="product-tag ${producto.tag === "oferta" ? "oferta" : ""}">${producto.tag}</span>`
    : "";

  return `
    <div class="product-card ${agotado ? "sin-stock" : ""}" style="animation-delay: ${index * 0.06}s"
         onclick="abrirModal(${producto.id})">
      <div class="product-img-wrapper">
        ${tagHtml}
        <img src="${producto.imagen}" alt="${producto.nombre}" class="product-img" loading="lazy" decoding="async" />
        <div class="product-img-overlay">
          <button class="overlay-btn" onclick="event.stopPropagation(); abrirModal(${producto.id})">
            Ver detalle
          </button>
        </div>
      </div>
      <div class="product-body">
        <span class="product-badge">${producto.tipo}</span>
        <h3 class="product-name">${producto.nombre}</h3>
        <p class="product-desc">${producto.descripcion.substring(0, 68)}…</p>
      </div>
      <div class="product-footer">
        <span class="product-price">S/ ${producto.precio.toFixed(2)}</span>
        <button
          class="product-fav ${esFavorito ? "active" : ""}"
          onclick="event.stopPropagation(); toggleFavDesdeCard(${producto.id}, this)"
          title="${esFavorito ? "Quitar de favoritos" : "Añadir a favoritos"}"
        >${esFavorito ? "♥" : "♡"}</button>
      </div>
    </div>
  `;
}

function abrirModal(id) {
  const p = PRODUCTOS.find((x) => x.id === id);
  if (!p) return;

  estado.productoActual = p;
  estado.tallaSeleccionada = null;
  estado.colorSeleccionado = null;
  estado.imgIndexActual = 0;

  document.getElementById("modalBadge").textContent = `${p.tipo.toUpperCase()} · Sport Dama`;
  document.getElementById("modalName").textContent = p.nombre;
  document.getElementById("modalPrice").textContent = "S/ " + p.precio.toFixed(2);
  document.getElementById("modalDesc").textContent = p.descripcion;
  document.getElementById("colorName").textContent = "–";

  const modalImg = document.getElementById("modalImg");
  modalImg.src = p.imagen;
  modalImg.style.display = "block";

  const sizesContainer = document.getElementById("modalSizes");
  sizesContainer.innerHTML = p.tallas
    .map((t) => {
      const disp = stockDeTalla(p, t);
      const arg = JSON.stringify(t).replace(/"/g, "&quot;");
      if (disp <= 0) {
        return `<button class="size-btn agotada" disabled title="Agotada">${t}</button>`;
      }
      const poco = disp <= 5 ? `<span class="size-quedan">${disp === 1 ? "Última" : "Quedan " + disp}</span>` : "";
      return `<div class="size-wrap"><button class="size-btn" onclick="seleccionarTalla(this, ${arg})">${t}</button>${poco}</div>`;
    })
    .join("");

  const btnAgregar = document.getElementById("btnAddToCart");
  if (btnAgregar) {
    const sinStock = productoAgotado(p);
    btnAgregar.disabled = sinStock;
    btnAgregar.textContent = sinStock ? "Agotado" : "Añadir al carrito";
  }

  const colores = Array.isArray(p.colores) ? p.colores : [p.colores];
  const colorsContainer = document.getElementById("modalColors");
  colorsContainer.innerHTML = colores
    .map(
      (c, i) => `
    <div class="color-dot ${i === 0 ? "active" : ""}"
         style="background-color: ${c.hex}; border-color: ${i === 0 ? "#3f2601" : "transparent"}"
         onclick="seleccionarColor(this, '${c.nombre}')"
         title="${c.nombre}">
    </div>
  `
    )
    .join("");

  if (colores.length > 0) {
    estado.colorSeleccionado = colores[0].nombre;
    document.getElementById("colorName").textContent = colores[0].nombre;
    if (colores[0].imagen) modalImg.src = colores[0].imagen;
  }

  const esFav = estado.favoritos.includes(p.id);
  const favBtn = document.getElementById("favBtn");
  favBtn.innerHTML = esFav ? "♥ Guardado" : "♡ Guardar";
  favBtn.style.color = esFav ? "#c0392b" : "";

  document.getElementById("modalOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(event) {
  if (event && event.target !== document.getElementById("modalOverlay")) return;
  document.getElementById("modalOverlay").classList.remove("open");
  document.body.style.overflow = "";
  estado.productoActual = null;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// Zoom siguiendo el cursor sobre la imagen del modal de detalle (solo
// en dispositivos con mouse real; en celular/táctil no se activa nada).
(function initZoomImagenModal() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const wrap = document.querySelector(".modal-img-wrap");
  const img = document.getElementById("modalImg");
  if (!wrap || !img) return;

  wrap.addEventListener("mousemove", (e) => {
    const rect = wrap.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = `${x}% ${y}%`;
    wrap.classList.add("zoom-activo");
  });

  wrap.addEventListener("mouseleave", () => {
    wrap.classList.remove("zoom-activo");
    img.style.transformOrigin = "center center";
  });
})();

function seleccionarTalla(btn, talla) {
  document.querySelectorAll(".size-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  estado.tallaSeleccionada = talla;
}

function seleccionarColor(dot, nombre) {
  document.querySelectorAll(".color-dot").forEach((d) => {
    d.style.borderColor = "transparent";
    d.classList.remove("active");
  });
  dot.classList.add("active");
  dot.style.borderColor = "#3f2601";
  estado.colorSeleccionado = nombre;
  document.getElementById("colorName").textContent = nombre;

  const p = estado.productoActual;
  if (!p) return;
  const colores = Array.isArray(p.colores) ? p.colores : [p.colores];
  const colorElegido = colores.find((c) => c.nombre === nombre);
  const modalImg = document.getElementById("modalImg");
  modalImg.src = (colorElegido && colorElegido.imagen) ? colorElegido.imagen : p.imagen;
}

function toggleFav() {
  if (!estado.productoActual) return;
  const id = estado.productoActual.id;
  const idx = estado.favoritos.indexOf(id);
  const favBtn = document.getElementById("favBtn");
  if (idx === -1) {
    estado.favoritos.push(id);
    favBtn.innerHTML = "♥ Guardado";
    favBtn.style.color = "#c0392b";
    mostrarToast("✓ Guardado en favoritos");
  } else {
    estado.favoritos.splice(idx, 1);
    favBtn.innerHTML = "♡ Guardar";
    favBtn.style.color = "";
    mostrarToast("Eliminado de favoritos");
  }
  renderProductos();
}

function toggleFavDesdeCard(id, btn) {
  const idx = estado.favoritos.indexOf(id);
  if (idx === -1) {
    estado.favoritos.push(id);
    btn.innerHTML = "♥";
    btn.classList.add("active");
    mostrarToast("✓ Guardado en favoritos");
  } else {
    estado.favoritos.splice(idx, 1);
    btn.innerHTML = "♡";
    btn.classList.remove("active");
    mostrarToast("Eliminado de favoritos");
  }
}

function addToCart() {
  if (!estado.productoActual) return;
  if (!estado.tallaSeleccionada) {
    mostrarToast("⚠ Por favor elige una talla");
    return;
  }
  const disp = stockDeTalla(estado.productoActual, estado.tallaSeleccionada);
  const enCarrito = unidadesEnCarrito(estado.productoActual.id, estado.tallaSeleccionada);
  if (enCarrito + 1 > disp) {
    mostrarToast(
      disp <= 0
        ? "⚠ Esa talla está agotada"
        : `⚠ Solo hay ${disp} unidad(es) en talla ${estado.tallaSeleccionada} y ya las tienes en el carrito`
    );
    return;
  }
  const item = {
    id: estado.productoActual.id,
    nombre: estado.productoActual.nombre,
    precio: estado.productoActual.precio,
    imagen: estado.productoActual.imagen,
    talla: estado.tallaSeleccionada,
    color: estado.colorSeleccionado || "—",
    cantidad: 1,
  };
  const existente = estado.carrito.find(
    (c) => c.id === item.id && c.talla === item.talla && c.color === item.color
  );
  if (existente) {
    existente.cantidad += 1;
  } else {
    estado.carrito.push(item);
  }
  actualizarCarritoUI();
  closeModal();
  mostrarToast(`✓ "${item.nombre}" añadido al carrito`);
}

function toggleCart() {
  const sidebar = document.getElementById("cartSidebar");
  const overlay = document.getElementById("cartOverlay");
  sidebar.classList.toggle("open");
  overlay.classList.toggle("open");
  if (sidebar.classList.contains("open")) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
}

function eliminarDelCarrito(index) {
  estado.carrito.splice(index, 1);
  actualizarCarritoUI();
  mostrarToast("Producto eliminado del carrito");
}

function actualizarCarritoUI() {
  const cartItemsEl = document.getElementById("cartItems");
  const cartFooter = document.getElementById("cartFooter");
  const badge = document.getElementById("cartBadge");
  const total = estado.carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const totalItems = estado.carrito.reduce((sum, item) => sum + item.cantidad, 0);

  badge.textContent = totalItems;
  badge.style.display = totalItems > 0 ? "flex" : "none";

  if (estado.carrito.length === 0) {
    cartItemsEl.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
    cartFooter.style.display = "none";
  } else {
    cartItemsEl.innerHTML = estado.carrito
      .map(
        (item, i) => `
      <div class="cart-item">
        <img src="${item.imagen}" alt="${item.nombre}" class="cart-item-img" loading="lazy" decoding="async" />
        <div class="cart-item-info">
          <div class="cart-item-name">${item.nombre}</div>
          <div class="cart-item-meta">Talla ${item.talla} · ${item.color} · x${item.cantidad}</div>
          <div class="cart-item-price">S/ ${(item.precio * item.cantidad).toFixed(2)}</div>
        </div>
        <button class="cart-item-remove" onclick="eliminarDelCarrito(${i})" title="Eliminar">✕</button>
      </div>
    `
      )
      .join("");
    document.getElementById("cartTotal").textContent = `S/ ${total.toFixed(2)}`;
    cartFooter.style.display = "block";
  }
}

function checkout() {
  if (estado.carrito.length === 0) return;

  // Cierra el panel del carrito para dejar espacio al formulario de datos
  const sidebar = document.getElementById("cartSidebar");
  const cartOverlay = document.getElementById("cartOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (cartOverlay) cartOverlay.classList.remove("open");

  document.getElementById("checkoutForm").classList.remove("hidden");
  document.getElementById("checkoutSuccess").classList.add("hidden");
  document.getElementById("checkoutTitulo").textContent = "Datos del cliente";
  document.getElementById("checkoutSub").textContent = "Completa tu información para finalizar el pedido";
  const btnConf = document.getElementById("btnConfirmarPedido");
  if (btnConf) { btnConf.disabled = false; btnConf.textContent = "Confirmar pedido"; }
  ["ckNombre", "ckDni", "ckTelefono", "ckEmail", "ckDireccion", "ckNota"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  ["ckNombreErr", "ckDniErr", "ckTelefonoErr", "ckEmailErr", "ckDireccionErr"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  document.getElementById("checkoutOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function cerrarCheckout(event) {
  if (event && event.target !== document.getElementById("checkoutOverlay")) return;
  clearInterval(temporizadorReserva);
  document.getElementById("checkoutOverlay").classList.remove("open");
  document.body.style.overflow = "";
}

function enviarPedido() {
  const nombre    = document.getElementById("ckNombre");
  const telefono  = document.getElementById("ckTelefono");
  const email     = document.getElementById("ckEmail");
  const direccion = document.getElementById("ckDireccion");
  const nota      = document.getElementById("ckNota");

  let valido = true;

  if (nombre.value.trim().length < 3) {
    document.getElementById("ckNombreErr").textContent = "Ingresa tu nombre completo.";
    valido = false;
  } else {
    document.getElementById("ckNombreErr").textContent = "";
  }

  const dni = document.getElementById("ckDni");
  if (!/^\d{8}$/.test(dni.value.trim())) {
    document.getElementById("ckDniErr").textContent = "El DNI debe tener 8 dígitos.";
    valido = false;
  } else {
    document.getElementById("ckDniErr").textContent = "";
  }

  if (telefono.value.trim().length < 7) {
    document.getElementById("ckTelefonoErr").textContent = "Ingresa un teléfono válido.";
    valido = false;
  } else {
    document.getElementById("ckTelefonoErr").textContent = "";
  }

  if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    document.getElementById("ckEmailErr").textContent = "Correo inválido.";
    valido = false;
  } else {
    document.getElementById("ckEmailErr").textContent = "";
  }

  if (direccion.value.trim().length < 5) {
    document.getElementById("ckDireccionErr").textContent = "Ingresa una dirección válida.";
    valido = false;
  } else {
    document.getElementById("ckDireccionErr").textContent = "";
  }

  if (!valido) return;

  const total = estado.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

  const pedido = {
    cliente: {
      nombre:    nombre.value.trim(),
      dni:       dni.value.trim(),
      telefono:  telefono.value.trim(),
      email:     email.value.trim(),
      direccion: direccion.value.trim(),
      nota:      nota.value.trim(),
    },
    items: estado.carrito.map((i) => ({
      id:       i.id,
      nombre:   i.nombre,
      talla:    i.talla,
      color:    i.color,
      cantidad: i.cantidad,
      precio:   i.precio,
      subtotal: parseFloat((i.precio * i.cantidad).toFixed(2)),
    })),
    total: parseFloat(total.toFixed(2)),
  };

  // RNF-02: evita duplicar el pedido si se toca el botón varias veces.
  const btn = document.getElementById("btnConfirmarPedido");
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = "Registrando...";

  fetch("/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pedido),
  })
    .then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = new Error(data.error || "Error del servidor");
        err.status = r.status;
        err.detalle = data.detalle;
        throw err;
      }
      return data;
    })
    .then((data) => {
      recargarProductos();
      estado.carrito = [];
      actualizarCarritoUI();
      try { localStorage.setItem("cp_pedido", data.codigo); } catch (e) {}
      mostrarChipPedido(data.codigo);
      mostrarPanelPedido(data.codigo);
    })
    .catch((err) => {
      btn.disabled = false;
      btn.textContent = "Confirmar pedido";
      if (err.status === 409 && Array.isArray(err.detalle)) {
        const lista = err.detalle
          .map((d) => `${d.nombre} (talla ${d.talla}): ${d.disponible > 0 ? "quedan " + d.disponible : "agotado"}`)
          .join(" · ");
        mostrarToast("⚠ Sin stock suficiente — " + lista + ". Ajusta tu carrito.", 7000);
        recargarProductos();
      } else if (err.status) {
        mostrarToast(err.message, 5000);
      } else {
        mostrarToast("Sin conexión. Revisa tu internet e intenta de nuevo (tu pedido no se duplicó).");
      }
    });
}

// ---------------------------------------------------------------- Seguimiento y pago
const ETAPAS_PEDIDO = {
  RESERVADO: ["Reservado", "Reservamos tus productos. Falta informar tu pago."],
  PAGO_VALIDADO: ["Pago confirmado", "Recibimos tu pago. Pronto prepararemos tu pedido."],
  EN_PREPARACION: ["En preparación", "Estamos preparando tu pedido."],
  ENTREGADO: ["Entregado", "Tu pedido fue entregado. ¡Gracias por tu compra!"],
  CANCELADO: ["Cancelado", "La reserva venció o el pedido fue cancelado."],
  PENDIENTE: ["Pendiente", "Registramos tu pedido."],
};

let temporizadorReserva = null;

function ahoraLimaMs() {
  const p = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date()).forEach(({ type, value }) => (p[type] = value));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour === "24" ? 0 : p.hour, p.minute, p.second);
}

function mostrarChipPedido(codigo) {
  const chip = document.getElementById("pedidoChip");
  if (!chip) return;
  document.getElementById("pedidoChipCodigo").textContent = codigo;
  chip.classList.remove("hidden");
}

function abrirSeguimiento() {
  let codigo = "";
  try { codigo = localStorage.getItem("cp_pedido") || ""; } catch (e) {}
  if (!codigo) {
    codigo = (prompt("Ingresa el código de tu pedido (ej. CP-AB12CD):") || "").trim();
    if (!codigo) return;
  }
  mostrarPanelPedido(codigo);
}

function escHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

async function mostrarPanelPedido(codigo) {
  document.getElementById("checkoutForm").classList.add("hidden");
  document.getElementById("checkoutSuccess").classList.remove("hidden");
  document.getElementById("checkoutOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
  document.getElementById("checkoutTitulo").textContent = "Tu pedido";
  document.getElementById("checkoutSub").textContent = "";
  const panel = document.getElementById("pedidoPanel");
  panel.innerHTML = '<p class="text-center">Cargando...</p>';
  clearInterval(temporizadorReserva);
  vouchersPendiente = "";

  let seg, cfg;
  try {
    const rs = await fetch("/api/seguimiento?codigo=" + encodeURIComponent(codigo));
    seg = await rs.json();
    if (!rs.ok) {
      panel.innerHTML = `<p class="text-center">${escHtml(seg.error || "No se pudo consultar el pedido")}</p>`;
      try { if (rs.status === 404) localStorage.removeItem("cp_pedido"); } catch (e) {}
      const chip = document.getElementById("pedidoChip");
      if (chip && rs.status === 404) chip.classList.add("hidden");
      return;
    }
    cfg = await (await fetch("/api/config")).json();
  } catch (e) {
    panel.innerHTML = '<p class="text-center">No se pudo conectar. Intenta de nuevo.</p>';
    return;
  }

  const [titulo, detalle] = ETAPAS_PEDIDO[seg.estado] || [seg.estado, ""];
  const enRevision = seg.pagos.some((p) => p.estado === "POR_VALIDAR");
  const rechazado = !enRevision && seg.pagos.length && seg.pagos[seg.pagos.length - 1].estado === "RECHAZADO";
  const necesitaPago = seg.estado === "RESERVADO" && !enRevision;

  const items = seg.items
    .map((i) => `<li>${i.cantidad}× ${escHtml(i.nombre)} <small>(talla ${escHtml(i.talla)}, ${escHtml(i.color)})</small></li>`)
    .join("");

  let html = `
    <div class="pedido-cabecera">
      <div class="pedido-codigo">${escHtml(seg.codigo)}</div>
      <span class="pedido-estado est-${seg.estado}">${escHtml(titulo)}</span>
    </div>
    <p class="pedido-detalle">${escHtml(detalle)}${enRevision ? " Tu pago está en revisión: te confirmaremos pronto." : ""}</p>
    <ul class="pedido-items">${items}</ul>
    <p class="pedido-total">Total: <strong>S/ ${Number(seg.total).toFixed(2)}</strong></p>`;

  if (seg.comprobante) {
    html += `<p class="pedido-detalle">Comprobante: ${escHtml(seg.comprobante.tipo)} ${escHtml(seg.comprobante.numero)}</p>`;
  }
  if (rechazado && seg.estado === "RESERVADO") {
    html += '<p class="pedido-alerta">Tu último pago fue rechazado. Revisa el código de operación e inténtalo de nuevo.</p>';
  }

  if (necesitaPago) {
    html += `
      <div class="pago-caja">
        <div class="pago-timer">Tiempo para pagar: <strong id="pagoTimer">--:--</strong></div>
        <p class="pago-instr-titulo">Paga S/ ${Number(seg.total).toFixed(2)} y luego informa tu pago:</p>
        <pre class="pago-instr">${escHtml(cfg.instrucciones_pago || "Consulta con la tienda los datos de pago.")}</pre>
        ${htmlQrPago(cfg.qr)}
        <div class="form-group">
          <label for="pagoMedio">Medio de pago</label>
          <select id="pagoMedio" class="form-control">${cfg.medios.map((m) => `<option>${escHtml(m)}</option>`).join("")}</select>
        </div>
        <div class="form-group">
          <label for="pagoRef">Código de operación</label>
          <input type="text" id="pagoRef" class="form-control" maxlength="40" placeholder="Ej. 123456 (no ingreses datos de tarjeta)">
        </div>
        <div class="form-group">
          <span class="voucher-titulo">Captura de tu pago <small>(recomendado)</small></span>
          <div class="voucher-drop" id="voucherDrop">
            <input type="file" id="pagoVoucher" class="voucher-input" accept="image/*" onchange="elegirVoucher(this)" aria-label="Adjuntar captura del voucher">
            <label class="voucher-zona" for="pagoVoucher">
              <img id="voucherPreview" alt="" class="voucher-mini hidden">
              <svg class="voucher-icono" id="voucherIcono" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5m0 0-4 4m4-4 4 4M5 15v3a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-3"/></svg>
              <span class="voucher-textos">
                <span class="voucher-principal" id="voucherTexto">Adjuntar captura del voucher</span>
                <span class="voucher-sub" id="voucherNombre">JPG o PNG</span>
              </span>
            </label>
            <button type="button" class="voucher-quitar hidden" id="voucherQuitar" onclick="quitarVoucher()" aria-label="Quitar captura">&times;</button>
          </div>
        </div>
        <button class="btn btn-gold btn-full" id="btnInformarPago" onclick="informarPago('${escHtml(seg.codigo)}')">Informar mi pago</button>
        <p class="pago-nota">Validamos tu pago manualmente. Si no informas el pago a tiempo, se libera el stock.</p>
      </div>`;
  } else if (seg.estado === "RESERVADO" && enRevision) {
    html += '<p class="pago-nota">Cuando validemos tu pago verás aquí el cambio de estado. Puedes volver con tu código desde "Mi pedido".</p>';
  }

  html += '<button class="btn btn-outline btn-full" style="margin-top:.8rem" onclick="cerrarCheckout()">Cerrar</button>';
  panel.innerHTML = html;

  if (necesitaPago && seg.reserva_vence) {
    const vence = Date.parse(seg.reserva_vence + "Z");
    const pintar = () => {
      const el = document.getElementById("pagoTimer");
      if (!el) return clearInterval(temporizadorReserva);
      const rest = Math.max(0, vence - ahoraLimaMs());
      const mm = String(Math.floor(rest / 60000)).padStart(2, "0");
      const ss = String(Math.floor((rest % 60000) / 1000)).padStart(2, "0");
      el.textContent = `${mm}:${ss}`;
      if (rest === 0) { clearInterval(temporizadorReserva); mostrarPanelPedido(seg.codigo); }
    };
    pintar();
    temporizadorReserva = setInterval(pintar, 1000);
  }
}

function htmlQrPago(qr) {
  const items = [["Yape", qr && qr.yape], ["Plin", qr && qr.plin]].filter((x) => x[1] && /^data:image\//.test(x[1]));
  if (!items.length) return "";
  return `<div class="pago-qrs">${items
    .map(([n, src]) => `<figure><img src="${src}" alt="QR ${n}"><figcaption>Escanea con ${n}</figcaption></figure>`)
    .join("")}</div>`;
}

let vouchersPendiente = "";

// Reduce la foto a un JPEG liviano (máx. 1000 px) para subirla rápido desde el celular.
function comprimirImagen(archivo, maxLado = 1000, calidad = 0.72) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida"));
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        const x = c.getContext("2d");
        x.fillStyle = "#fff";
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", calidad));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

async function elegirVoucher(input) {
  const archivo = input.files && input.files[0];
  input.value = "";
  if (!archivo) return;
  try {
    let data = await comprimirImagen(archivo);
    if (data.length > 560000) data = await comprimirImagen(archivo, 800, 0.6);
    if (data.length > 560000) throw new Error("La imagen es muy pesada. Prueba con otra captura.");
    vouchersPendiente = data;
    const prev = document.getElementById("voucherPreview");
    prev.src = data;
    prev.classList.remove("hidden");
    document.getElementById("voucherIcono").classList.add("hidden");
    document.getElementById("voucherTexto").textContent = "Captura adjunta";
    document.getElementById("voucherNombre").textContent = archivo.name || "Toca para cambiar";
    document.getElementById("voucherQuitar").classList.remove("hidden");
    document.getElementById("voucherDrop").classList.add("tiene-archivo");
  } catch (e) {
    mostrarToast(e.message, 4000);
  }
}

function quitarVoucher() {
  vouchersPendiente = "";
  const prev = document.getElementById("voucherPreview");
  prev.removeAttribute("src");
  prev.classList.add("hidden");
  document.getElementById("voucherIcono").classList.remove("hidden");
  document.getElementById("voucherTexto").textContent = "Adjuntar captura del voucher";
  document.getElementById("voucherNombre").textContent = "JPG o PNG";
  document.getElementById("voucherQuitar").classList.add("hidden");
  document.getElementById("voucherDrop").classList.remove("tiene-archivo");
}

async function informarPago(codigo) {
  const btn = document.getElementById("btnInformarPago");
  const medio = document.getElementById("pagoMedio").value;
  const referencia = document.getElementById("pagoRef").value.trim();
  if (referencia.length < 3) { mostrarToast("Ingresa el código de operación de tu pago"); return; }
  btn.disabled = true;
  btn.textContent = "Enviando...";
  try {
    const r = await fetch("/api/pedidos/pago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, medio, referencia, voucher: vouchersPendiente || undefined }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "No se pudo registrar el pago");
    vouchersPendiente = "";
    mostrarToast("✓ Pago informado. Lo revisaremos pronto.");
    mostrarPanelPedido(codigo);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Informar mi pago";
    mostrarToast(e.message, 5000);
  }
}

function validateField(field) {
  const id = field.id;
  let errorMsg = "";
  const val = field.value.trim();

  if (id === "contactName") {
    if (val.length < 3) errorMsg = "El nombre debe tener al menos 3 caracteres.";
  } else if (id === "contactEmail") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) errorMsg = "Ingresa un correo electrónico válido.";
  } else if (id === "contactMsg") {
    if (val.length < 10) errorMsg = "El mensaje debe tener al menos 10 caracteres.";
  }

  const errorMap = { contactName: "nameError", contactEmail: "emailError", contactMsg: "msgError" };
  const errorEl = document.getElementById(errorMap[id]);
  if (errorEl) errorEl.textContent = errorMsg;

  field.classList.toggle("error", errorMsg !== "");
  field.classList.toggle("valid", errorMsg === "" && val.length > 0);
}

// Muestra u oculta los campos extra según el tipo de solicitud elegido.
function cambiarTipoContacto(tipo) {
  document.getElementById("grupoPedido").classList.toggle("hidden", !(tipo === "cambio" || tipo === "reclamo"));
  document.getElementById("grupoPersonalizado").classList.toggle("hidden", tipo !== "personalizado");
  const msg = document.getElementById("contactMsg");
  const ayudas = {
    consulta: "¿En qué podemos ayudarte?",
    cambio: "Cuéntanos qué deseas cambiar (talla, color, modelo)...",
    reclamo: "Cuéntanos qué ocurrió con tu pedido...",
    personalizado: "Describe el calzado que quieres: diseño, materiales, detalles...",
  };
  msg.placeholder = ayudas[tipo] || ayudas.consulta;
}

// Vuelve a mostrar el formulario vacío después de un envío exitoso.
function nuevoMensajeContacto() {
  const form = document.getElementById("contactForm");
  form.reset();
  form.querySelectorAll(".form-control").forEach((c) => c.classList.remove("valid", "error"));
  form.querySelectorAll(".field-error").forEach((e) => (e.textContent = ""));
  cambiarTipoContacto("consulta");
  form.classList.remove("hidden");
  document.getElementById("formSuccess").classList.add("hidden");
}

function formatPhone(input) {
  let val = input.value.replace(/[^\d+]/g, "");
  if (val.startsWith("51") && val.length > 2) {
    val = "+51 " + val.slice(2).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  }
  input.value = val;
}

async function submitForm(e) {
  e.preventDefault();
  const name = document.getElementById("contactName");
  const email = document.getElementById("contactEmail");
  const phone = document.getElementById("contactPhone");
  const msg = document.getElementById("contactMsg");
  validateField(name);
  validateField(email);
  validateField(msg);
  const hasErrors =
    name.classList.contains("error") ||
    !name.value.trim() ||
    email.classList.contains("error") ||
    !email.value.trim() ||
    msg.classList.contains("error") ||
    !msg.value.trim();
  if (hasErrors) {
    mostrarToast("⚠ Por favor completa todos los campos correctamente.");
    return;
  }

  const btnEnviar = document.querySelector("#contactForm button[type='submit']");
  const textoOriginal = btnEnviar ? btnEnviar.textContent : null;
  if (btnEnviar) {
    btnEnviar.disabled = true;
    btnEnviar.textContent = "Enviando...";
  }

  const tipo = document.getElementById("contactType").value;
  const payload = {
    tipo,
    nombre: name.value.trim(),
    email: email.value.trim(),
    telefono: phone ? phone.value.trim() : "",
    mensaje: msg.value.trim(),
  };
  if (tipo === "cambio" || tipo === "reclamo") {
    payload.pedido_codigo = document.getElementById("contactOrder").value.trim();
  }
  if (tipo === "personalizado") {
    payload.detalle = {
      modelo: document.getElementById("customModel").value.trim(),
      color: document.getElementById("customColor").value.trim(),
      talla: document.getElementById("customSize").value.trim(),
      cantidad: document.getElementById("customQty").value.trim(),
    };
  }

  // Si el servidor no responde en 20 s se corta, para que el botón nunca quede en "Enviando...".
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), 20000);
  try {
    const resp = await fetch("/api/contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: control.signal,
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "No se pudo enviar tu mensaje.");

    const codigoEl = document.getElementById("formSuccessCode");
    if (data.codigo) {
      codigoEl.textContent = "Tu código de seguimiento: " + data.codigo;
      codigoEl.classList.remove("hidden");
    } else {
      codigoEl.classList.add("hidden");
    }
    document.getElementById("contactForm").classList.add("hidden");
    document.getElementById("formSuccess").classList.remove("hidden");
    mostrarToast("✓ Mensaje enviado con éxito");
  } catch (err) {
    const mensaje = err.name === "AbortError" ? "El servidor tardó demasiado en responder. Intenta de nuevo." : err.message;
    mostrarToast("⚠ " + mensaje, 5000);
  } finally {
    clearTimeout(corte);
    if (btnEnviar) {
      btnEnviar.disabled = false;
      btnEnviar.textContent = textoOriginal;
    }
  }
}

let toastTimeout = null;
function mostrarToast(mensaje, duracion = 2800) {
  const toast = document.getElementById("toast");
  if (toastTimeout) clearTimeout(toastTimeout);
  toast.textContent = mensaje;
  toast.classList.add("show");
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, duracion);
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function iniciarScrollEvents() {
  const backToTop = document.getElementById("backToTop");
  const header = document.getElementById("mainHeader");
  const heroScroll = document.getElementById("heroScroll");
  window.addEventListener("scroll", () => {
    const scrollY = window.scrollY;
    backToTop.classList.toggle("visible", scrollY > 300);
    header.classList.toggle("scrolled", scrollY > 80);
    if (heroScroll) heroScroll.style.opacity = scrollY > 60 ? "0" : "1";
  });
}

function iniciarAnimacionEstadisticas() {
  const nums = document.querySelectorAll(".stat-num");
  if (!nums.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animarNumero(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  nums.forEach((n) => observer.observe(n));
}

function animarNumero(el) {
  const target = parseInt(el.dataset.target);
  const duracion = 1400;
  const step = target / (duracion / 16);
  let current = 0;
  const interval = setInterval(() => {
    current += step;
    if (current >= target) {
      el.textContent = target.toLocaleString("es-PE");
      clearInterval(interval);
    } else {
      el.textContent = Math.floor(current).toLocaleString("es-PE");
    }
  }, 16);
}

function iniciarNavActiva() {
  function getAbsTop(el) {
    let top = 0,
      node = el;
    while (node) {
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return top;
  }
  const sectionMap = [
    { id: "inicio", el: document.getElementById("inicio") },
    { id: "modelos", el: document.getElementById("modelos") },
    { id: "nosotros", el: document.getElementById("nosotros") },
    { id: "contacto", el: document.getElementById("contacto") },
  ]
    .filter((s) => s.el)
    .map((s) => ({ id: s.id, top: getAbsTop(s.el) }));

  function actualizarNavActiva() {
    const headerH = document.getElementById("mainHeader").offsetHeight;
    const umbral = window.scrollY + headerH + 10;
    let activa = sectionMap[0].id;
    for (const s of sectionMap) {
      if (s.top <= umbral) activa = s.id;
    }
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.section === activa);
    });
  }
  window.addEventListener("scroll", actualizarNavActiva, { passive: true });
  actualizarNavActiva();
}

const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    menuToggle.classList.toggle("open");
    navLinks.classList.toggle("mobile-open");
  });
}

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    menuToggle.classList.remove("open");
    navLinks.classList.remove("mobile-open");
  });
});

function resetFilters() {
  estado.filtroCategoria = "todos";
  estado.textoBusqueda = "";
  estado.ordenamiento = "default";
  estado.filtroTalla = "";
  const selTalla = document.getElementById("tallaSelect");
  if (selTalla) selTalla.value = "";
  document.getElementById("searchInput").value = "";
  document.getElementById("sortSelect").value = "default";
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  document.querySelector('.chip[data-cat="todos"]').classList.add("active");
  renderProductos();
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const targetId = link.getAttribute("href").replace("#", "");
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    e.preventDefault();
    if (menuToggle) menuToggle.classList.remove("open");
    if (navLinks) navLinks.classList.remove("mobile-open");
    const headerAltura = document.getElementById("mainHeader").offsetHeight;
    const posicion = targetEl.getBoundingClientRect().top + window.scrollY - headerAltura;
    window.scrollTo({ top: posicion, behavior: "smooth" });
  });
});
