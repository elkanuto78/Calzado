let PRODUCTOS = [];

let estado = {
  filtroCategoria: "todos",
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
      renderProductos();
    })
    .catch(() => mostrarToast("Error al cargar los productos"));

  iniciarScrollEvents();
  iniciarAnimacionEstadisticas();
  iniciarNavActiva();
});

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

function renderProductos() {
  let lista = [...PRODUCTOS];

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
  const tagHtml = producto.tag
    ? `<span class="product-tag ${producto.tag === "oferta" ? "oferta" : ""}">${producto.tag}</span>`
    : "";

  return `
    <div class="product-card" style="animation-delay: ${index * 0.06}s"
         onclick="abrirModal(${producto.id})">
      <div class="product-img-wrapper">
        ${tagHtml}
        <img src="${producto.imagen}" alt="${producto.nombre}" class="product-img" />
        <div class="product-img-overlay">
          <button class="overlay-btn" onclick="event.stopPropagation(); abrirModal(${producto.id})">
            Ver detalle
          </button>
        </div>
      </div>
      <div class="product-body">
        <span class="product-badge">Cód. ${producto.codigo} · ${producto.tipo}</span>
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

  document.getElementById("modalBadge").textContent = `Cód. ${p.codigo} · ${p.tipo.toUpperCase()} · Sport Dama`;
  document.getElementById("modalName").textContent = p.nombre;
  document.getElementById("modalPrice").textContent = "S/ " + p.precio.toFixed(2);
  document.getElementById("modalDesc").textContent = p.descripcion;
  document.getElementById("colorName").textContent = "–";

  const modalImg = document.getElementById("modalImg");
  modalImg.src = p.imagen;
  modalImg.style.display = "block";

  const thumbsContainer = document.getElementById("modalThumbs");
  const vistas = ["Frontal", "Lateral", "Detalle"];
  thumbsContainer.innerHTML = vistas
    .map(
      (v, i) => `
    <div class="modal-thumb ${i === 0 ? "active" : ""}"
         onclick="cambiarImagen(${i})" title="${v}">
      <img src="${p.imagen}" alt="${v}" />
    </div>
  `
    )
    .join("");

  const sizesContainer = document.getElementById("modalSizes");
  sizesContainer.innerHTML = p.tallas
    .map((t) => `<button class="size-btn" onclick="seleccionarTalla(this, ${t})">${t}</button>`)
    .join("");

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

function cambiarImagen(index) {
  estado.imgIndexActual = index;
  document.querySelectorAll(".modal-thumb").forEach((t, i) => {
    t.classList.toggle("active", i === index);
  });
  mostrarToast(`Vista: ${["Frontal", "Lateral", "Detalle"][index]}`);
}

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
        <img src="${item.imagen}" alt="${item.nombre}" class="cart-item-img" />
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
  ["ckNombre", "ckTelefono", "ckEmail", "ckDireccion", "ckNota"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  ["ckNombreErr", "ckTelefonoErr", "ckEmailErr", "ckDireccionErr"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  document.getElementById("checkoutOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function cerrarCheckout(event) {
  if (event && event.target !== document.getElementById("checkoutOverlay")) return;
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

  fetch("/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pedido),
  })
    .then((r) => r.json())
    .then((data) => {
      estado.carrito = [];
      actualizarCarritoUI();
      document.getElementById("checkoutForm").classList.add("hidden");
      document.getElementById("checkoutSuccess").classList.remove("hidden");
      document.getElementById("checkoutSuccessMsg").textContent =
        `Pedido #${data.id} registrado. Total: S/ ${total.toFixed(2)}. Nos contactaremos contigo pronto.`;
    })
    .catch(() => mostrarToast("Error al registrar el pedido. Intenta de nuevo."));
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

function formatPhone(input) {
  let val = input.value.replace(/[^\d+]/g, "");
  if (val.startsWith("51") && val.length > 2) {
    val = "+51 " + val.slice(2).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  }
  input.value = val;
}

function submitForm(e) {
  e.preventDefault();
  const name = document.getElementById("contactName");
  const email = document.getElementById("contactEmail");
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
  document.getElementById("contactForm").classList.add("hidden");
  document.getElementById("formSuccess").classList.remove("hidden");
  mostrarToast("✓ Mensaje enviado con éxito");
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
