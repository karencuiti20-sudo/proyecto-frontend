// CompuTab · front con el dashboard nuevo, conectado al backend PHP.
// Usa config.js (URLs), session.js (sesión y permisos) y api.js (peticiones).

const $ = (selector) => document.querySelector(selector);
const mqMovil = window.matchMedia("(max-width: 768px)");
const mqTablet = window.matchMedia("(min-width: 769px) and (max-width: 1024px)");

let usuarios = [];
let equipos = [];
let cursos = [];
let prestamos = [];            // todos (para tarjetas, reportes y devoluciones)
let prestamosHistorial = [];   // los que muestra la tabla del historial (con buscar y ordenar)

// ---------- Utilidades ----------
const norm = (s) => String(s ?? "").toLowerCase();
const fecha = (f) => (f ? String(f).slice(0, 10) : "—");
const estaDevuelto = (p) => norm(p.estado) === "devuelto";
const esPrestado = (e) => ["prestado", "prestada", "activo"].includes(norm(e.estado));

// Crea elementos con textContent (los datos del servidor nunca se insertan como HTML)
function el(tag, props = {}, ...hijos) {
  const { clase, texto, ...attrs } = props;
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  e.append(...hijos);
  return e;
}
const celda = (texto) => el("td", { texto: texto ?? "—" });

// Deja escribir solo números (cédula, teléfonos)
function soloNumeros(input) {
  input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, ""); });
}

function mostrarMensaje(texto, esError = false) {
  Aviso.mostrar(texto, esError);   // js/modales.js
}

// Modal de error con "Reintentar". Si venció la sesión ya avisa otro código, así que no se duplica.
function errorConReintento(error, reintentar, titulo) {
  if (error.status === 401) return;
  Modal.error(error.message, titulo).then((quiereReintentar) => { if (quiereReintentar) reintentar(); });
}

function badge(texto, clase) {
  return el("span", { clase: "badge " + clase, texto });
}
// Imagen del equipo: la que mande el backend (campo "imagen") o una ilustración según el tipo
const esTablet = (e) =>
  /tablet|^tab/.test(norm(e.tipo)) || /^tab/.test(norm(e.inventario)) || /\b(tab|tablet|ipad)\b/.test(norm(e.modelo));
const tipoDeEquipo = (e) => e.tipo ?? (esTablet(e) ? "Tablet" : "Notebook");
const imagenPorDefecto = (e) => (esTablet(e) ? "img/tablet.svg" : "img/laptop.svg");

function imgEquipo(e, clase = "thumb") {
  const img = el("img", { clase, src: e.imagen || imagenPorDefecto(e), alt: tipoDeEquipo(e) + " " + (e.inventario ?? ""), loading: "lazy" });
  img.addEventListener("error", () => {
    if (!img.src.endsWith(imagenPorDefecto(e))) img.src = imagenPorDefecto(e);   // si la foto no carga, ilustración
  });
  return img;
}

function claseEstadoEquipo(e) {
  if (norm(e.estado) === "disponible") return "badge-green";
  if (esPrestado(e)) return "badge-blue";
  return "badge-yellow";   // mantenimiento u otro
}

function nombreUsuario(id) {
  const u = usuarios.find((x) => Number(x.id_usuario) === Number(id));
  // Nombre y apellido; el "usuario" de quien entra con cédula es la propia cédula
  if (u) return [u.nombre, u.apellido].filter(Boolean).join(" ") || u.usuario;
  const yo = obtenerUsuario();   // el rol "usuario" no tiene catálogo: usamos la sesión
  if (yo && Number(yo.id) === Number(id)) return yo.nombre || yo.usuario;
  return id ?? "—";
}
function nombreEquipo(id) {
  const e = equipos.find((x) => Number(x.id_pc) === Number(id));
  return e ? e.inventario + " (" + e.marca + " " + e.modelo + ")" : (id ?? "—");
}

// "Gastronomía · 2do año". Si el préstamo no tiene curso (los viejos) devuelve "vacio".
function nombreCurso(id, vacio = "—") {
  if (id === null || id === undefined || id === "") return vacio;
  const c = cursos.find((x) => Number(x.id_cursos) === Number(id));
  return c ? [c.nombre, c.descripcion].filter(Boolean).join(" · ") : vacio;
}

function filaVacia(tbody, columnas, texto) {
  tbody.appendChild(el("tr", {}, Object.assign(el("td", { clase: "vacio", texto }), { colSpan: columnas })));
}

// ---------- Navegación ----------
// Todas las pantallas vuelven al Dashboard (el rol usuario tiene su propio "Inicio").
let vistaActual = null;
const idInicio = () => (esRolUsuario() ? "view-mi-inicio" : "view-dashboard");

function mostrarVista(idVista) {
  // El rol "usuario" nunca ve el Dashboard de administración: va a su Inicio
  if (idVista === "view-dashboard" && esRolUsuario()) idVista = "view-mi-inicio";
  document.querySelectorAll(".content-view").forEach((v) => v.classList.remove("active"));
  const vista = document.getElementById(idVista);
  if (vista) vista.classList.add("active");
  document.querySelectorAll(".menu-item").forEach((item) => {
    const activo = !item.hidden && item.dataset.ir === idVista;
    item.classList.toggle("active", activo);
    if (activo) $("#current-path").textContent = item.querySelector("span").textContent;
  });
  vistaActual = idVista;
  const enInicio = idVista === idInicio();
  $("#btn-volver").hidden = enInicio;
  $("#btn-volver-txt").textContent = esRolUsuario() ? "Volver al Inicio" : "Volver al Dashboard";
}

// El historial del navegador tiene 2 niveles: el Dashboard y la pantalla actual.
// reiniciar = true al entrar (empieza de cero)
function irA(idVista, reiniciar = false) {
  if (reiniciar) {
    history.replaceState({ vista: idVista }, "");
    mostrarVista(idVista);
    return;
  }
  const inicio = idInicio();
  if (idVista === inicio) {
    if (vistaActual !== inicio) history.back();   // dispara popstate → muestra el Dashboard
    else mostrarVista(inicio);
    return;
  }
  if (vistaActual === inicio) history.pushState({ vista: idVista }, "");
  else history.replaceState({ vista: idVista }, "");
  mostrarVista(idVista);
}

// Botón Volver y botón "atrás" del navegador: siempre al Dashboard
$("#btn-volver").addEventListener("click", () => irA(idInicio()));
window.addEventListener("popstate", () => { if (obtenerUsuario()) mostrarVista(idInicio()); });

document.addEventListener("click", (e) => {
  const destino = e.target.closest("[data-ir]");
  if (!destino) return;
  // Las tarjetas del inicio dejan la tabla ya filtrada (ej: "Préstamos activos")
  if (destino.dataset.fpEstado !== undefined) filtrarPrestamos(destino.dataset.fpEstado, destino.dataset.fpOrden || "");
  if (destino.dataset.feEstado !== undefined) filtrarEquipos(destino.dataset.feEstado);
  irA(destino.dataset.ir);
  if (mqMovil.matches) cerrarMenuMovil();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const destino = e.target.closest(".menu-item[data-ir], .indicator-card[data-ir]");
  if (!destino) return;
  e.preventDefault();
  destino.click();
});

function filtrarPrestamos(estado, orden) {
  $("#form-filtros").reset();
  $("#f-estado").value = estado;
  if (orden) { $("#f-orden").value = orden; $("#f-direccion").value = "asc"; }
  aplicarFiltros();
}
function filtrarEquipos(estado) {
  $("#q-texto").value = "";
  $("#q-orden").value = "";
  $("#q-direccion").value = "asc";
  $("#q-estado").value = estado;
  dibujarEquipos();
}

const esRolUsuario = () => { const u = obtenerUsuario(); return u !== null && u.rol === "usuario"; };

// El backend ya filtra, pero acá también: el rol usuario solo ve lo suyo
function prestamosVisibles() {
  if (!esRolUsuario()) return prestamos;
  const yo = obtenerUsuario();
  return prestamos.filter((p) => Number(p.id_usuario) === Number(yo.id));
}

// ---------- Dibujar vistas ----------
function dibujarDashboard() {
  const activos = prestamos.filter((p) => !estaDevuelto(p));
  const disponibles = equipos.filter((e) => norm(e.estado) === "disponible").length;

  $("#dash-pc-disponibles").textContent = disponibles;
  $("#dash-total-usuarios").textContent = usuarios.length;
  $("#dash-prestamos-activos").textContent = activos.length;

}

function dibujarMiInicio() {
  const yo = obtenerUsuario();
  if (!yo) return;
  const mios = prestamosVisibles();
  const activos = mios.filter((p) => !estaDevuelto(p));
  const hoy = hoyISO();

  $("#mi-nombre").textContent = yo.nombre || yo.usuario;
  $("#mi-disponibles").textContent = equipos.filter((e) => norm(e.estado) === "disponible").length;
  $("#mi-activos").textContent = activos.length;
  $("#mi-devueltos").textContent = mios.length - activos.length;
  const fechas = activos.map((p) => fecha(p.fecha_prevista)).filter((f) => f !== "—").sort();
  $("#mi-proxima").textContent = fechas.length ? fechas[0] : "—";

  const tbody = $("#mi-activos-body");
  tbody.innerHTML = "";
  if (!activos.length) return filaVacia(tbody, 5, "No tenés equipos prestados. Podés pedir uno cuando lo necesites.");
  for (const p of activos) {
    const f = fecha(p.fecha_prevista);
    let situacion = badge("En plazo", "badge-green");
    if (f !== "—" && f < hoy) situacion = badge("Vencido", "badge-red");
    else if (f === hoy) situacion = badge("Vence hoy", "badge-yellow");

    const b = el("button", { type: "button", clase: "btn btn-green btn-sm", texto: "Devolver" });
    b.addEventListener("click", () => devolver(p.id_prestamo));
    const tr = el("tr");
    const eq = equipos.find((x) => Number(x.id_pc) === Number(p.id_pc));
    const tdEquipo = el("td", {}, el("div", { clase: "equipo-celda" }, ...(eq ? [imgEquipo(eq, "thumb thumb-sm")] : []), nombreEquipo(p.id_pc)));
    tr.append(celda(p.id_prestamo), tdEquipo, celda(f),
              el("td", {}, situacion), el("td", { clase: "acciones" }, b));
    tbody.appendChild(tr);
  }
}

// "activo", "ACTIVO" y "Activo" se muestran siempre igual
function textoEstadoUsuario(estado) {
  const e = norm(estado);
  if (e === "activo") return "Activo";
  if (e === "inactivo") return "Inactivo";
  return estado ?? "—";
}

function dibujarUsuarios() {
  const tbody = $("#tabla-usuarios-body");
  tbody.innerHTML = "";
  $("#contador-usuarios").textContent = usuarios.length;
  const puedeEditar = puede("editar_usuario");
  $("#th-acciones-usuarios").hidden = !puedeEditar;
  if (!usuarios.length) return filaVacia(tbody, puedeEditar ? 6 : 5, "No hay usuarios para mostrar");
  for (const u of usuarios) {
    const tr = el("tr");
    tr.append(
      celda(u.id_usuario), celda(u.usuario), celda(u.ci),
      celda([u.nombre, u.apellido].filter(Boolean).join(" ")),
      el("td", {}, badge(textoEstadoUsuario(u.estado), norm(u.estado) === "activo" ? "badge-green" : "badge-red"))
    );
    if (puedeEditar) {
      const b = el("button", { type: "button", clase: "btn btn-outline btn-sm", texto: "Editar" });
      b.addEventListener("click", () => abrirFormUsuario(u));
      tr.appendChild(el("td", { clase: "acciones" }, b));
    }
    tbody.appendChild(tr);
  }
}

// Buscar y ordenar el inventario (se hace en el navegador con los equipos ya cargados)
const coincideEstado = (e, f) => !f || (f === "prestado" ? esPrestado(e) : norm(e.estado) === f);

function equiposFiltrados() {
  const texto = norm($("#q-texto").value).trim();
  const estado = $("#q-estado").value;
  const orden = $("#q-orden").value;
  const dir = $("#q-direccion").value === "desc" ? -1 : 1;

  const lista = equipos.filter((e) =>
    coincideEstado(e, estado) &&
    (texto === "" || [e.inventario, e.marca, e.modelo, e.observaciones].some((v) => norm(v).includes(texto))));

  if (orden) {
    lista.sort((a, b) =>
      String(a[orden] ?? "").localeCompare(String(b[orden] ?? ""), "es", { numeric: true, sensitivity: "base" }) * dir);
  }
  return lista;
}

const datosEquipo = (e, cambios = {}) => ({
  inventario: e.inventario, marca: e.marca, modelo: e.modelo,
  ...(e.tipo !== undefined ? { tipo: e.tipo } : {}),
  estado: e.estado, observaciones: e.observaciones ?? null, ...cambios
});

function dibujarEquipos() {
  const tbody = $("#tabla-pc-body");
  tbody.innerHTML = "";
  const lista = equiposFiltrados();
  $("#contador-pc").textContent = lista.length === equipos.length ? equipos.length : lista.length + " de " + equipos.length;

  const puedeEditar = puede("editar");
  const puedeEliminar = puede("eliminar");
  const hayAcciones = puedeEditar || puedeEliminar;
  $("#th-acciones-pc").hidden = !hayAcciones;

  if (!lista.length) {
    return filaVacia(tbody, hayAcciones ? 8 : 7, equipos.length ? "Ningún equipo coincide con la búsqueda" : "No hay equipos para mostrar");
  }
  for (const e of lista) {
    const tr = el("tr");
    const icono = esTablet(e) ? "fa-tablet-alt" : "fa-laptop";
    tr.append(
      el("td", {}, imgEquipo(e)),
      celda(e.inventario), celda(e.marca), celda(e.modelo),
      el("td", {}, el("i", { clase: "fas " + icono }), " " + tipoDeEquipo(e)),
      el("td", {}, badge(e.estado ?? "—", claseEstadoEquipo(e))),
      celda(e.observaciones)
    );
    if (hayAcciones) {
      const td = el("td", { clase: "acciones" });
      const prestado = esPrestado(e);
      if (puedeEditar) {
        const b = el("button", { type: "button", clase: "btn btn-outline btn-sm", texto: "Editar" });
        b.addEventListener("click", () => abrirFormEquipo(e));
        td.appendChild(b);
        if (!prestado) {   // un equipo prestado no se puede pasar a mantenimiento
          const enMant = norm(e.estado) === "mantenimiento";
          const t = el("button", { type: "button", clase: "btn btn-outline btn-sm", texto: enMant ? "Habilitar" : "Mantenimiento" });
          t.addEventListener("click", () => cambiarEstadoEquipo(e, enMant ? "Disponible" : "Mantenimiento"));
          td.appendChild(t);
        }
      }
      if (puedeEliminar && !prestado) {
        const b = el("button", { type: "button", clase: "btn btn-danger btn-sm", texto: "Eliminar" });
        b.addEventListener("click", () => eliminarEquipo(e));
        td.appendChild(b);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// Sin mayúsculas ni tildes: "garcia" encuentra "García"
const simple = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// ¿El usuario del préstamo coincide con lo escrito? (nombre, apellido o nombre de usuario)
function coincideUsuario(p, texto) {
  const q = simple(texto);
  if (!q) return true;
  const u = usuarios.find((x) => Number(x.id_usuario) === Number(p.id_usuario));
  const campos = u ? [u.usuario, u.nombre, u.apellido, u.nombre + " " + u.apellido] : [nombreUsuario(p.id_usuario)];
  return campos.some((c) => simple(c).includes(q));
}

function dibujarHistorial() {
  const tbody = $("#tabla-historial-body");
  tbody.innerHTML = "";
  const estadoFiltro = $("#f-estado").value;
  const lista = (esRolUsuario()
    ? prestamosHistorial.filter((p) => Number(p.id_usuario) === Number(obtenerUsuario().id))
    : prestamosHistorial
  ).filter((p) => !estadoFiltro || (estadoFiltro === "devuelto") === estaDevuelto(p))
   .filter((p) => coincideUsuario(p, $("#f-usuario").value));
  $("#contador-historial").textContent = lista.length;

  const puedeDevolver = puede("devolver");
  const puedeEliminar = puede("eliminar");
  const hayAcciones = puedeDevolver || puedeEliminar;
  $("#th-acciones").hidden = !hayAcciones;

  if (!lista.length) return filaVacia(tbody, hayAcciones ? 8 : 7, (hayFiltros(leerFiltros()) || estadoFiltro) ? "Ningún préstamo coincide con la búsqueda"
      : esRolUsuario() ? "Todavía no pediste ningún equipo" : "No hay préstamos para mostrar");

  for (const p of lista) {
    const tr = el("tr");
    tr.append(
      celda(p.id_prestamo), celda(nombreUsuario(p.id_usuario)), celda(nombreEquipo(p.id_pc)),
      celda(nombreCurso(p.id_cursos)),
      celda(fecha(p.fecha_prevista)), celda(fecha(p.fecha_prestamo_devolucion)),
      el("td", {}, badge(p.estado ?? "—", estaDevuelto(p) ? "badge-green" : "badge-blue"))
    );
    if (hayAcciones) {
      const td = el("td", { clase: "acciones" });
      if (puedeDevolver && !estaDevuelto(p)) {
        const b = el("button", { type: "button", clase: "btn btn-green btn-sm", texto: "Devolver" });
        b.addEventListener("click", () => devolver(p.id_prestamo));
        td.appendChild(b);
      }
      if (puedeEliminar) {
        const b = el("button", { type: "button", clase: "btn btn-danger btn-sm", texto: "Eliminar" });
        b.addEventListener("click", () => eliminar(p));
        td.appendChild(b);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// ---------- Reportes (con filtro por rango de fechas) ----------
// Filtra por la fecha en que se pidió el préstamo (fecha_prestamo, si el backend la manda);
// si no existe, usa la fecha prevista de devolución.
const fechaBase = (p) => fecha(p.fecha_prestamo ?? p.fecha_prevista);

function rangoValido() {
  const d = $("#r-desde").value, h = $("#r-hasta").value;
  const ok = !(d && h && d > h);
  $("#err-r-rango").textContent = ok ? "" : "La fecha «Desde» no puede ser posterior a «Hasta»";
  return ok;
}

function prestamosReporte() {
  const desde = $("#r-desde").value, hasta = $("#r-hasta").value, estado = $("#r-estado").value;
  return prestamos.filter((p) => {
    const f = fechaBase(p);
    if (desde && (f === "—" || f < desde)) return false;
    if (hasta && (f === "—" || f > hasta)) return false;
    if (estado && (estado === "devuelto") !== estaDevuelto(p)) return false;
    return true;
  });
}

function dibujarReportes() {
  const lista = rangoValido() ? prestamosReporte() : [];
  const desde = $("#r-desde").value, hasta = $("#r-hasta").value;
  document.querySelectorAll(".card-reporte[data-r-estado]").forEach((t) =>
    t.classList.toggle("seleccionada", t.dataset.rEstado === $("#r-estado").value));
  $("#rep-total-prestamos").textContent = lista.length;
  $("#rep-prestamos-activos").textContent = lista.filter((p) => !estaDevuelto(p)).length;
  $("#rep-equipos-disponibles").textContent = equipos.filter((e) => norm(e.estado) === "disponible").length;
  $("#rep-total-usuarios").textContent = usuarios.length;
  $("#rep-rango").textContent = (desde || hasta)
    ? "Mostrando préstamos " + (desde ? "desde el " + fechaCorta(desde) : "") + (desde && hasta ? " " : "") + (hasta ? "hasta el " + fechaCorta(hasta) : "") + "."
    : "Mostrando todos los préstamos.";

  const tbody = $("#tabla-reportes-body");
  tbody.innerHTML = "";
  if (!lista.length) return filaVacia(tbody, 7, prestamos.length ? "No hay préstamos en el período elegido." : "Todavía no hay préstamos registrados.");
  for (const p of lista) {
    const tr = el("tr");
    tr.append(
      celda(p.id_prestamo), celda(nombreUsuario(p.id_usuario)), celda(nombreEquipo(p.id_pc)),
      celda(nombreCurso(p.id_cursos)),
      celda(fecha(p.fecha_prevista)), celda(fecha(p.fecha_prestamo_devolucion)),
      el("td", {}, badge(p.estado ?? "—", estaDevuelto(p) ? "badge-green" : "badge-blue"))
    );
    tbody.appendChild(tr);
  }
}

$("#form-reportes").addEventListener("submit", (e) => { e.preventDefault(); dibujarReportes(); });
for (const id of ["#r-desde", "#r-hasta", "#r-estado"]) $(id).addEventListener("change", dibujarReportes);

// Tarjetas de Reportes: "Total" y "Activos" filtran el listado de abajo; "Equipos" y "Usuarios" abren su pantalla
// (esas dos las maneja el click general de [data-ir]).
document.addEventListener("click", (e) => {
  const tarjeta = e.target.closest(".card-reporte[data-r-estado]");
  if (!tarjeta) return;
  $("#r-estado").value = tarjeta.dataset.rEstado;
  dibujarReportes();
  $("#tabla-reportes-body").closest(".tabla-scroll").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tarjeta = e.target.closest(".card-reporte[tabindex]");
  if (!tarjeta) return;
  e.preventDefault();
  tarjeta.click();
});
$("#btn-limpiar-reportes").addEventListener("click", () => { $("#form-reportes").reset(); dibujarReportes(); });

function llenarSelect(select, items, valor, texto, vacio = "Elegí una opción") {
  select.innerHTML = "";
  select.appendChild(el("option", { value: "", texto: vacio }));
  for (const it of items) select.appendChild(el("option", { value: valor(it), texto: texto(it) }));
}

function dibujarFormularios() {
  llenarSelect($("#p-usuario"),
    usuarios.filter((u) => norm(u.estado) === "activo"),
    (u) => u.id_usuario, (u) => u.nombre + " " + u.apellido + " (" + u.usuario + ")");
  llenarSelect($("#p-curso"), cursos, (c) => c.id_cursos, (c) => nombreCurso(c.id_cursos), "Elegí un curso o grupo");
  dibujarTarjetasEquipos();
  ponerFechaPorDefecto();
  llenarSelect($("#d-prestamo"),
    prestamosVisibles().filter((p) => !estaDevuelto(p)),
    (p) => p.id_prestamo,
    (p) => "N° " + p.id_prestamo + " — " + nombreUsuario(p.id_usuario) + " — " + nombreEquipo(p.id_pc),
    "Elegí un préstamo");
}

function dibujarTodo() {
  dibujarDashboard();
  dibujarMiInicio();
  dibujarUsuarios();
  dibujarEquipos();
  dibujarCursos();
  dibujarHistorial();
  dibujarReportes();
  dibujarFormularios();
}

// ---------- Cargar datos del backend ----------
async function cargarDatos() {
  const verUsuarios = puede("ver_usuarios");
  const [rEq, rUs, rPr, rCu] = await Promise.allSettled([
    apiListarEquipos(),
    verUsuarios ? apiListarUsuarios() : Promise.resolve([]),
    apiListarPrestamos({}),
    apiListarCursos()   // todos los roles: el formulario de préstamo pide el curso
  ]);
  const lista = (r, nombre) => {
    if (r.status === "fulfilled") return Array.isArray(r.value) ? r.value : [];
    mostrarMensaje(nombre + ": " + r.reason.message, true);
    return [];
  };
  equipos = lista(rEq, "Equipos");
  usuarios = lista(rUs, "Usuarios");
  prestamos = lista(rPr, "Préstamos");
  cursos = lista(rCu, "Cursos");
  await traerHistorial();
  dibujarTodo();
}

// ---------- Registrar préstamo ----------
const pideASuNombre = () => !puede("ver_usuarios");   // el rol "usuario" pide a su nombre

function hoyISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// ---- Fechas del préstamo ----
const isoLocal = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

function fechaMasDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

// Devolución sugerida: hoy + DIAS_PRESTAMO días corridos (igual que prestamos.php)
function fechaDevolucionPorDefecto() {
  return fechaMasDias(DIAS_PRESTAMO);
}

function fechaCorta(iso) {
  const [y, m, d] = iso.split("-");
  return d + "/" + m + "/" + y;
}

function fechaLarga(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function actualizarResumen() {
  $("#res-retiro").textContent = fechaLarga(hoyISO());
  $("#res-devolucion").textContent = fechaLarga($("#p-fecha").value);
}

function ponerFechaPorDefecto() {
  $("#p-fecha").value = fechaDevolucionPorDefecto();
  actualizarResumen();
}
$("#p-fecha").addEventListener("change", actualizarResumen);

// ---- Equipos disponibles como tarjetas (en vez de un desplegable) ----
function seleccionarEquipo(id) {
  $("#p-equipo").value = id;
  $("#err-p-equipo").textContent = "";
  document.querySelectorAll(".equipo-card").forEach((b) => {
    const activa = Number(b.dataset.id) === Number(id);
    b.classList.toggle("seleccionada", activa);
    b.setAttribute("aria-checked", String(activa));
  });
}

function dibujarTarjetasEquipos() {
  const grid = $("#p-equipos-grid");
  grid.replaceChildren();
  $("#p-equipo").value = "";
  const libres = equipos.filter((e) => norm(e.estado) === "disponible");
  if (!libres.length) {
    grid.appendChild(el("p", { clase: "hint", texto: "No hay equipos disponibles en este momento." }));
    return;
  }
  for (const e of libres) {
    const b = el("button", { type: "button", clase: "equipo-card", role: "radio", "aria-checked": "false", "data-id": e.id_pc },
      imgEquipo(e, "equipo-card-img"),
      el("strong", { texto: e.inventario }),
      el("span", { texto: [e.marca, e.modelo].filter(Boolean).join(" ") }),
      el("small", { texto: tipoDeEquipo(e) }));
    b.addEventListener("click", () => seleccionarEquipo(e.id_pc));
    grid.appendChild(b);
  }
}

function validarPrestamo() {
  let ok = true;
  for (const c of ["usuario", "curso", "equipo", "fecha", "obs"]) $("#err-p-" + c).textContent = "";
  if (!pideASuNombre() && $("#p-usuario").value === "") { $("#err-p-usuario").textContent = "Elegí un usuario"; ok = false; }
  if ($("#p-curso").value === "") {
    $("#err-p-curso").textContent = cursos.length ? "Elegí el curso o grupo" : "No hay cursos cargados: pedile a un administrador que los agregue";
    ok = false;
  }
  if ($("#p-equipo").value === "") { $("#err-p-equipo").textContent = "Tocá un equipo para elegirlo"; ok = false; }
  const f = $("#p-fecha").value;
  if (f === "") { $("#err-p-fecha").textContent = "Elegí la fecha de devolución"; ok = false; }
  else if (f < hoyISO()) { $("#err-p-fecha").textContent = "La fecha no puede ser anterior a hoy"; ok = false; }
  else if (f > fechaMasDias(MAX_DIAS_PRESTAMO)) { $("#err-p-fecha").textContent = "El préstamo no puede superar los " + MAX_DIAS_PRESTAMO + " días"; ok = false; }
  if ($("#p-obs").value.length > 100) { $("#err-p-obs").textContent = "Máximo 100 caracteres"; ok = false; }
  if (!ok) {
    const primero = document.querySelector("#form-prestamo .error-campo:not(:empty)");
    if (primero) primero.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  return ok;
}

$("#form-prestamo").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validarPrestamo()) return;
  const yo = obtenerUsuario();
  const nuevo = {
    id_usuario: pideASuNombre() ? Number(yo.id) : Number($("#p-usuario").value),
    id_pc: Number($("#p-equipo").value),
    id_cursos: Number($("#p-curso").value),
    fecha_prevista: $("#p-fecha").value,
    observaciones: $("#p-obs").value.trim() || null
  };
  $("#btn-guardar").disabled = true;
  try {
    const r = await apiCrearPrestamo(nuevo);
    const soyEstudiante = esRolUsuario();
    const cartel = Modal.agregado(
      "El préstamo N° " + r.id_prestamo + " se registró correctamente." + (soyEstudiante ? " La sesión se cerrará sola." : ""), true);
    $("#form-prestamo").reset();
    if (soyEstudiante) {
      // El estudiante ya terminó: cuando se cierra el cartel (solo, o con Aceptar) se cierra la sesión
      await cartel;
      await cerrarSesion();
      return;
    }
    await cargarDatos();
    irA("view-historial");
  } catch (error) {
    errorConReintento(error, () => $("#form-prestamo").requestSubmit());
  } finally {
    $("#btn-guardar").disabled = false;
  }
});

// ---------- Buscar y ordenar (historial de préstamos) ----------
function leerFiltros() {
  const orden = $("#f-orden").value;
  return {
    orden: orden,
    direccion: orden ? $("#f-direccion").value : ""
  };
}
const hayFiltros = (f) => Object.values(f).some((v) => String(v).trim() !== "");

// Pide al backend los préstamos con los filtros actuales (sin dibujar)
async function traerHistorial() {
  const filtros = leerFiltros();
  $("#url-actual").textContent = "Petición: GET " + construirUrl(PRESTAMOS_URL, filtros);
  if (!hayFiltros(filtros)) { prestamosHistorial = prestamos; return; }
  try {
    prestamosHistorial = await apiListarPrestamos(filtros);
  } catch (error) {
    prestamosHistorial = [];
    mostrarMensaje(error.message, true);
  }
}

async function aplicarFiltros() {
  await traerHistorial();
  dibujarHistorial();
}

$("#form-filtros").addEventListener("submit", (e) => { e.preventDefault(); aplicarFiltros(); });
$("#btn-limpiar").addEventListener("click", () => { $("#form-filtros").reset(); aplicarFiltros(); });
$("#f-orden").addEventListener("change", aplicarFiltros);
$("#f-direccion").addEventListener("change", aplicarFiltros);
$("#f-estado").addEventListener("change", aplicarFiltros);
$("#f-usuario").addEventListener("input", dibujarHistorial);   // se filtra mientras escribís

// ---------- Agregar / editar equipo (notebook o tablet) ----------
let equipoEditando = null;   // null = agregando uno nuevo

function limpiarErroresEquipo() {
  for (const c of ["inventario", "marca", "modelo", "obs"]) $("#err-e-" + c).textContent = "";
}

function abrirFormEquipo(equipo = null) {
  equipoEditando = equipo;
  const f = $("#form-equipo");
  f.reset();
  limpiarErroresEquipo();
  $("#titulo-form-equipo").textContent = equipo ? "Editar equipo" : "Agregar equipo";
  $("#btn-guardar-equipo").textContent = equipo ? "Guardar cambios" : "Guardar equipo";
  if (equipo) {
    $("#e-tipo").value = esTablet(equipo) ? "Tablet" : "Notebook";
    $("#e-inventario").value = equipo.inventario ?? "";
    $("#e-marca").value = equipo.marca ?? "";
    $("#e-modelo").value = equipo.modelo ?? "";
    $("#e-obs").value = equipo.observaciones ?? "";
  }
  f.hidden = false;
  f.scrollIntoView({ block: "nearest" });
  $("#e-inventario").focus();
}

// Devuelve el motivo exacto por el que un N° de inventario no sirve (o "" si está bien)
function errorInventario(v) {
  if (v.length < 3) return "Tiene que tener al menos 3 caracteres (ej: PC-01)";
  if (v.length > 30) return "No puede tener más de 30 caracteres";
  if (/[^A-Za-z0-9-]/.test(v)) return "Solo letras, números y guiones (sin espacios ni otros símbolos)";
  if (v.startsWith("-")) return "No puede empezar con guion: agregá un prefijo (ej: PC-01)";
  return "";
}

function cerrarFormEquipo() {
  equipoEditando = null;
  $("#form-equipo").hidden = true;
  $("#form-equipo").reset();
  limpiarErroresEquipo();
}

$("#btn-nuevo-equipo").addEventListener("click", () => {
  if (!$("#form-equipo").hidden && !equipoEditando) cerrarFormEquipo();
  else abrirFormEquipo();
});
$("#btn-cancelar-equipo").addEventListener("click", cerrarFormEquipo);

// Al elegir Tablet se sugiere el prefijo TAB- (así el sistema la reconoce como tablet)
$("#e-tipo").addEventListener("change", () => {
  const inv = $("#e-inventario");
  const tablet = $("#e-tipo").value === "Tablet";
  if (tablet && inv.value.trim() === "") inv.value = "TAB-";
  if (!tablet && inv.value.trim().toUpperCase() === "TAB-") inv.value = "";
});

$("#form-equipo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const tipo = $("#e-tipo").value;
  const inventario = $("#e-inventario").value.trim();
  const marca = $("#e-marca").value.trim();
  const modelo = $("#e-modelo").value.trim();
  const observaciones = $("#e-obs").value.trim() || null;
  let ok = true;
  limpiarErroresEquipo();

  const repetido = equipos.some((x) => norm(x.inventario) === norm(inventario) &&
    (!equipoEditando || Number(x.id_pc) !== Number(equipoEditando.id_pc)));
  if (inventario === "") { $("#err-e-inventario").textContent = "Escribí el N° de inventario"; ok = false; }
  else if (errorInventario(inventario)) { $("#err-e-inventario").textContent = errorInventario(inventario); ok = false; }
  else if (repetido) { $("#err-e-inventario").textContent = "Ese N° de inventario ya existe"; ok = false; }
  else if (tipo === "Tablet" && !/^tab/i.test(inventario)) { $("#err-e-inventario").textContent = "En una tablet tiene que empezar con TAB (ej: TAB-2026-001)"; ok = false; }
  else if (tipo === "Notebook" && /^tab/i.test(inventario)) { $("#err-e-inventario").textContent = "Un N° que empieza con TAB es de tablet: cambiá el tipo o el N°"; ok = false; }
  if (marca === "") { $("#err-e-marca").textContent = "Escribí la marca"; ok = false; }
  else if (marca.length < 2 || !/[A-Za-z0-9]/.test(marca)) { $("#err-e-marca").textContent = "La marca tiene que tener al menos 2 caracteres válidos"; ok = false; }
  if (modelo === "") { $("#err-e-modelo").textContent = "Escribí el modelo"; ok = false; }
  else if (modelo.length < 2 || !/[A-Za-z0-9]/.test(modelo)) { $("#err-e-modelo").textContent = "El modelo tiene que tener al menos 2 caracteres válidos"; ok = false; }
  if (observaciones && observaciones.length > 100) { $("#err-e-obs").textContent = "Máximo 100 caracteres"; ok = false; }
  if (!ok) return;

  $("#btn-guardar-equipo").disabled = true;
  try {
    if (equipoEditando) {
      await apiEditarEquipo(equipoEditando.id_pc, { inventario, marca, modelo, tipo, observaciones, estado: equipoEditando.estado });
      Modal.editado("Los cambios del equipo " + inventario + " se guardaron.");
    } else {
      await apiCrearEquipo({ inventario, marca, modelo, tipo, observaciones, estado: "Disponible" });
      Modal.agregado((tipo === "Tablet" ? "La tablet " : "El equipo ") + inventario + " se registró correctamente en el inventario.");
    }
    cerrarFormEquipo();
    await cargarDatos();
  } catch (error) {
    errorConReintento(error, () => $("#form-equipo").requestSubmit());
  } finally {
    $("#btn-guardar-equipo").disabled = false;
  }
});

async function cambiarEstadoEquipo(equipo, nuevoEstado) {
  try {
    await apiEditarEquipo(equipo.id_pc, datosEquipo(equipo, { estado: nuevoEstado }));
    mostrarMensaje(equipo.inventario + " ahora está en " + nuevoEstado.toLowerCase());
    await cargarDatos();
  } catch (error) {
    mostrarMensaje(error.message, true);
  }
}

async function eliminarEquipo(equipo) {
  if (!(await Modal.eliminar("el equipo " + equipo.inventario))) return;
  try {
    await apiEliminarEquipo(equipo.id_pc);
    mostrarMensaje("Equipo " + equipo.inventario + " eliminado");
    await cargarDatos();
  } catch (error) {
    errorConReintento(error, () => eliminarEquipo(equipo), "No se pudo eliminar");
  }
}

// Buscar y ordenar el inventario
for (const id of ["#q-texto", "#q-estado", "#q-orden", "#q-direccion"]) {
  $(id).addEventListener(id === "#q-texto" ? "input" : "change", dibujarEquipos);
}
$("#btn-limpiar-equipos").addEventListener("click", () => {
  for (const id of ["#q-texto", "#q-estado", "#q-orden", "#q-direccion"]) $(id).value = $(id).options ? $(id).options[0].value : "";
  dibujarEquipos();
});

// ---------- Cursos (listar, agregar, editar, eliminar) ----------
let cursoEditando = null;   // null = agregando uno nuevo

function cursosFiltrados() {
  const t = simple($("#qc-texto").value);
  if (!t) return cursos;
  return cursos.filter((c) => simple(c.nombre).includes(t) || simple(c.descripcion).includes(t));
}

function dibujarCursos() {
  const tbody = $("#tabla-cursos-body");
  tbody.innerHTML = "";
  const lista = cursosFiltrados();
  $("#contador-cursos").textContent = lista.length === cursos.length ? cursos.length : lista.length + " de " + cursos.length;

  const puedeEditar = puede("editar_curso");
  const puedeEliminar = puede("eliminar");
  const hayAcciones = puedeEditar || puedeEliminar;
  $("#th-acciones-cursos").hidden = !hayAcciones;

  if (!lista.length) {
    return filaVacia(tbody, hayAcciones ? 5 : 4, cursos.length ? "Ningún curso coincide con la búsqueda" : "No hay cursos para mostrar");
  }
  for (const c of lista) {
    const tr = el("tr");
    tr.append(celda(c.id_cursos), celda(c.nombre), celda(c.descripcion), celda(c.tipo_cursos));
    if (hayAcciones) {
      const td = el("td", { clase: "acciones" });
      if (puedeEditar) {
        const b = el("button", { type: "button", clase: "btn btn-outline btn-sm", texto: "Editar" });
        b.addEventListener("click", () => abrirFormCurso(c));
        td.appendChild(b);
      }
      if (puedeEliminar) {
        const b = el("button", { type: "button", clase: "btn btn-danger btn-sm", texto: "Eliminar" });
        b.addEventListener("click", () => eliminarCurso(c));
        td.appendChild(b);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function limpiarErroresCurso() {
  for (const c of ["nombre", "desc"]) $("#err-c-" + c).textContent = "";
}

function abrirFormCurso(curso = null) {
  cursoEditando = curso;
  const f = $("#form-curso");
  f.reset();
  limpiarErroresCurso();
  $("#titulo-form-curso").textContent = curso ? "Editar curso" : "Agregar curso";
  $("#btn-guardar-curso").textContent = curso ? "Guardar cambios" : "Guardar curso";
  if (curso) {
    $("#c-nombre").value = curso.nombre ?? "";
    $("#c-desc").value = curso.descripcion ?? "";
    $("#c-tipo").value = curso.tipo_cursos ?? "Curso";
  }
  f.hidden = false;
  f.scrollIntoView({ block: "nearest" });
  $("#c-nombre").focus();
}

function cerrarFormCurso() {
  cursoEditando = null;
  $("#form-curso").hidden = true;
  $("#form-curso").reset();
  limpiarErroresCurso();
}

$("#btn-nuevo-curso").addEventListener("click", () => {
  if (!$("#form-curso").hidden && !cursoEditando) cerrarFormCurso();
  else abrirFormCurso();
});
$("#btn-cancelar-curso").addEventListener("click", cerrarFormCurso);
$("#qc-texto").addEventListener("input", dibujarCursos);

$("#form-curso").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = $("#c-nombre").value.trim();
  const descripcion = $("#c-desc").value.trim();
  const tipo_cursos = $("#c-tipo").value;
  let ok = true;
  limpiarErroresCurso();

  const repetido = cursos.some((x) => simple(x.nombre) === simple(nombre) && simple(x.descripcion) === simple(descripcion) &&
    (!cursoEditando || Number(x.id_cursos) !== Number(cursoEditando.id_cursos)));
  if (nombre === "") { $("#err-c-nombre").textContent = "Escribí el nombre del curso"; ok = false; }
  else if (nombre.length < 2 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ0-9]/.test(nombre)) { $("#err-c-nombre").textContent = "El nombre tiene que tener al menos 2 caracteres válidos"; ok = false; }
  else if (repetido) { $("#err-c-nombre").textContent = "Ya existe un curso con ese nombre y esa descripción"; ok = false; }
  if (descripcion.length > 100) { $("#err-c-desc").textContent = "Máximo 100 caracteres"; ok = false; }
  if (!ok) return;

  $("#btn-guardar-curso").disabled = true;
  try {
    if (cursoEditando) {
      await apiEditarCurso(cursoEditando.id_cursos, { nombre, descripcion, tipo_cursos });
      Modal.editado("Los cambios del curso " + nombre + " se guardaron.");
    } else {
      await apiCrearCurso({ nombre, descripcion, tipo_cursos });
      Modal.agregado("El curso " + nombre + " se registró correctamente.");
    }
    cerrarFormCurso();
    await cargarDatos();
  } catch (error) {
    errorConReintento(error, () => $("#form-curso").requestSubmit());
  } finally {
    $("#btn-guardar-curso").disabled = false;
  }
});

async function eliminarCurso(curso) {
  if (!(await Modal.eliminar("el curso " + curso.nombre))) return;
  try {
    await apiEliminarCurso(curso.id_cursos);
    mostrarMensaje("Curso " + curso.nombre + " eliminado");
    await cargarDatos();
  } catch (error) {
    errorConReintento(error, () => eliminarCurso(curso), "No se pudo eliminar");
  }
}

// ---------- Devolver / eliminar ----------
async function devolver(id, pedirConfirmacion = true) {
  if (pedirConfirmacion &&
      !(await Modal.confirmar("¿Registrar la devolución?", "El préstamo N° " + id + " pasará a devuelto y el equipo quedará disponible."))) return;
  try {
    await apiDevolverPrestamo(id);
    Modal.devuelto("El préstamo N° " + id + " se devolvió correctamente.");
    await cargarDatos();
  } catch (error) {
    errorConReintento(error, () => devolver(id, false), "No se pudo registrar la devolución");
  }
}

async function eliminar(p) {
  if (!(await Modal.eliminar("el préstamo N° " + p.id_prestamo))) return;
  try {
    await apiEliminarPrestamo(p.id_prestamo);
    mostrarMensaje("Préstamo eliminado");
    await cargarDatos();
  } catch (error) {
    errorConReintento(error, () => eliminar(p), "No se pudo eliminar");
  }
}

$("#form-devolucion").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#err-d-prestamo").textContent = "";
  const id = $("#d-prestamo").value;
  if (id === "") { $("#err-d-prestamo").textContent = "Elegí un préstamo"; return; }
  $("#btn-devolver").disabled = true;
  await devolver(id, false);   // el botón "Confirmar devolución" ya es la confirmación
  $("#btn-devolver").disabled = false;
});

// ---------- Agregar usuario (solo administrador) ----------
const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]*$/;

function limpiarErroresNuevoUsuario() {
  for (const c of ["nombre", "apellido", "ci"]) $("#err-n-" + c).textContent = "";
}

soloNumeros($("#n-ci"));

function abrirFormNuevoUsuario() {
  cerrarFormUsuario();   // si estaba abierto el de editar, se cierra
  const f = $("#form-usuario-nuevo");
  f.reset();
  limpiarErroresNuevoUsuario();
  f.hidden = false;
  f.scrollIntoView({ block: "nearest" });
  $("#n-nombre").focus();
}

function cerrarFormNuevoUsuario() {
  $("#form-usuario-nuevo").hidden = true;
  $("#form-usuario-nuevo").reset();
  limpiarErroresNuevoUsuario();
}

$("#btn-nuevo-usuario").addEventListener("click", () => {
  if (!$("#form-usuario-nuevo").hidden) cerrarFormNuevoUsuario();
  else abrirFormNuevoUsuario();
});
$("#btn-cancelar-nuevo-usuario").addEventListener("click", cerrarFormNuevoUsuario);

// Estudiantes y docentes: la API pide contraseña, pero nunca la usan (entran por cédula)
function contraseniaAleatoria() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

$("#form-usuario-nuevo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = $("#n-nombre").value.trim();
  const apellido = $("#n-apellido").value.trim();
  const ci = $("#n-ci").value.trim();
  let ok = true;
  limpiarErroresNuevoUsuario();

  if (nombre.length < 3 || nombre.length > 16) { $("#err-n-nombre").textContent = "El nombre debe tener entre 3 y 16 caracteres"; ok = false; }
  else if (!SOLO_LETRAS.test(nombre)) { $("#err-n-nombre").textContent = "El nombre solo puede tener letras (sin números ni símbolos)"; ok = false; }
  if (apellido.length < 3 || apellido.length > 16) { $("#err-n-apellido").textContent = "El apellido debe tener entre 3 y 16 caracteres"; ok = false; }
  else if (!SOLO_LETRAS.test(apellido)) { $("#err-n-apellido").textContent = "El apellido solo puede tener letras (sin números ni símbolos)"; ok = false; }
  if (!/^\d{8,9}$/.test(ci)) { $("#err-n-ci").textContent = "La cédula tiene 8 o 9 números, sin puntos ni guión"; ok = false; }
  else if (usuarios.some((u) => String(u.ci) === ci)) { $("#err-n-ci").textContent = "Ya existe un usuario con esa cédula"; ok = false; }

  if (!ok) return;

  // Igual que cuando alguien se registra solo desde la pantalla inicial: la cédula es el usuario
  const usuario = ci;
  const contrasenia = contraseniaAleatoria();

  $("#btn-guardar-nuevo-usuario").disabled = true;
  try {
    await apiCrearUsuario({ ci, nombre, apellido, usuario, contrasenia, rol: "usuario" });
    Modal.agregado("El usuario " + nombre + " " + apellido + " se registró correctamente.");
    cerrarFormNuevoUsuario();
    await cargarDatos();
  } catch (error) {
    errorConReintento(error, () => $("#form-usuario-nuevo").requestSubmit());
  } finally {
    $("#btn-guardar-nuevo-usuario").disabled = false;
  }
});

// ---------- Editar usuario (y sus teléfonos) ----------
let usuarioEditando = null;
let telefonosForm = [];   // [{ tel, input, error }]; tel = null si es un teléfono nuevo
let contadorTel = 0;

// telefono.php devuelve { id_telefono, numero, fk_id_usuario }
const idTelefono = (t) => t.id_telefono;
const numeroTelefono = (t) => String(t.numero ?? "");

function limpiarErroresUsuario() {
  for (const c of ["nombre", "apellido", "ci"]) $("#err-u-" + c).textContent = "";
  telefonosForm.forEach((f) => { f.error.textContent = ""; });
}

// Agrega un campo de teléfono al formulario. tel = registro existente, o null para uno nuevo
function agregarCampoTelefono(tel, etiqueta) {
  const id = "u-tel-" + (++contadorTel);
  const input = el("input", { type: "tel", id, inputmode: "numeric", maxlength: "9", autocomplete: "off" });
  soloNumeros(input);
  input.value = tel ? numeroTelefono(tel) : "";
  const error = el("span", { clase: "error-campo" });
  $("#u-telefonos").appendChild(el("p", { clase: "form-group" },
    el("label", { for: id, texto: etiqueta }), input, error));
  telefonosForm.push({ tel, input, error });
  return input;
}

function dibujarTelefonosForm(lista, mensaje) {
  $("#u-telefonos").replaceChildren();
  telefonosForm = [];
  if (mensaje) { $("#u-telefonos").appendChild(el("p", { clase: "hint", texto: mensaje })); return; }
  lista.forEach((tel, i) => agregarCampoTelefono(tel, "Teléfono" + (lista.length > 1 ? " " + (i + 1) : "")));
}

$("#btn-agregar-telefono").addEventListener("click", () => {
  if (telefonosForm.length === 0) $("#u-telefonos").replaceChildren();   // saca el aviso "no tiene teléfonos"
  agregarCampoTelefono(null, "Teléfono nuevo").focus();
});

function abrirFormUsuario(u) {
  cerrarFormNuevoUsuario();   // no pueden estar abiertos los dos formularios a la vez
  usuarioEditando = u;
  $("#u-nombre").value = u.nombre ?? "";
  $("#u-apellido").value = u.apellido ?? "";
  $("#u-ci").value = u.ci ?? "";
  $("#u-estado").value = norm(u.estado) === "activo" ? "Activo" : "Inactivo";
  dibujarTelefonosForm([], "Cargando teléfonos…");
  $("#btn-agregar-telefono").disabled = true;   // se habilita cuando terminan de cargar
  limpiarErroresUsuario();
  const f = $("#form-usuario");
  f.hidden = false;
  f.scrollIntoView({ block: "nearest" });
  $("#u-nombre").focus();

  apiListarTelefonosDeUsuario(u.id_usuario)
    .then((lista) => {
      if (usuarioEditando !== u) return;
      dibujarTelefonosForm(lista, lista.length ? "" : "Este usuario no tiene teléfonos registrados.");
      $("#btn-agregar-telefono").disabled = false;
    })
    .catch((error) => {
      if (usuarioEditando !== u) return;
      dibujarTelefonosForm([], "No se pudieron cargar los teléfonos: " + error.message);
      $("#btn-agregar-telefono").disabled = false;
    });
}

function cerrarFormUsuario() {
  usuarioEditando = null;
  $("#form-usuario").hidden = true;
  dibujarTelefonosForm([], "");
  limpiarErroresUsuario();
}

$("#btn-cancelar-usuario").addEventListener("click", cerrarFormUsuario);
soloNumeros($("#u-ci"));

$("#form-usuario").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!usuarioEditando) return;
  const u = usuarioEditando;
  const nombre = $("#u-nombre").value.trim();
  const apellido = $("#u-apellido").value.trim();
  const ci = $("#u-ci").value.trim();
  const estado = $("#u-estado").value;
  let ok = true;
  limpiarErroresUsuario();

  const soloLetras = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]*$/;
  if (nombre.length < 3 || nombre.length > 16) { $("#err-u-nombre").textContent = "El nombre debe tener entre 3 y 16 caracteres"; ok = false; }
  else if (!soloLetras.test(nombre)) { $("#err-u-nombre").textContent = "El nombre solo puede tener letras (sin números ni símbolos)"; ok = false; }
  if (apellido.length < 3 || apellido.length > 16) { $("#err-u-apellido").textContent = "El apellido debe tener entre 3 y 16 caracteres"; ok = false; }
  else if (!soloLetras.test(apellido)) { $("#err-u-apellido").textContent = "El apellido solo puede tener letras (sin números ni símbolos)"; ok = false; }
  if (ci !== "" && !/^\d{8,9}$/.test(ci)) { $("#err-u-ci").textContent = "La cédula tiene 8 o 9 números, sin puntos ni guión"; ok = false; }
  const vistos = new Set();
  for (const f of telefonosForm) {
    const v = f.input.value.trim();
    if (f.tel === null && v === "") continue;   // campo nuevo vacío: se ignora
    if (!/^(09\d{7}|[24]\d{7})$/.test(v)) { f.error.textContent = "Celular: 09 + 7 números (ej: 099123456). Fijo: 8 números que empiezan con 2 o 4"; ok = false; }
    else if (vistos.has(v)) { f.error.textContent = "Ese teléfono está repetido"; ok = false; }
    vistos.add(v);
  }
  if (!ok) return;

  // El usuario (login) y la contraseña no se editan, así que no se envían
  const datos = { nombre, apellido, estado };
  if (ci !== "") datos.ci = Number(ci);

  $("#btn-guardar-usuario").disabled = true;
  try {
    await apiEditarUsuario(u.id_usuario, datos);
    for (const f of telefonosForm) {
      const nuevo = f.input.value.trim();
      if (f.tel === null) {                       // teléfono nuevo: se crea
        if (nuevo === "") continue;
        const r = await apiCrearTelefono({ id_usuario: u.id_usuario, numero: nuevo });
        f.tel = { id_telefono: r.id_telefono, numero: nuevo, fk_id_usuario: u.id_usuario };   // si se reintenta, no se duplica
        continue;
      }
      if (nuevo === numeroTelefono(f.tel)) continue;   // sin cambios
      await apiEditarTelefono(idTelefono(f.tel), { numero: nuevo });
      f.tel.numero = nuevo;
    }
    Modal.editado("Los datos de " + nombre + " se guardaron.");
    cerrarFormUsuario();
    await cargarDatos();
  } catch (error) {
    errorConReintento(error, () => $("#form-usuario").requestSubmit());
  } finally {
    $("#btn-guardar-usuario").disabled = false;
  }
});

// ---------- Reportes: exportar ----------
$("#btn-pdf").addEventListener("click", async () => {
  if (!(await Modal.confirmarPdf())) return;
  setTimeout(() => window.print(), 100);   // deja que el modal se cierre antes de abrir la impresión
});

$("#btn-csv").addEventListener("click", () => {
  if (!rangoValido()) { mostrarMensaje("Corregí el rango de fechas antes de exportar", true); return; }
  const lista = prestamosReporte();
  if (!lista.length) { Modal.sinDatos(prestamos.length ? "No hay préstamos en el período elegido." : undefined); return; }

  const f = (x) => { const v = fecha(x); return v === "—" ? "" : v; };
  const conPedido = lista.some((p) => p.fecha_prestamo);
  const filas = [["N°", "Usuario", "Equipo", "Curso", ...(conPedido ? ["Pedido"] : []), "Prevista", "Devuelto", "Estado"]];
  for (const p of lista) {
    filas.push([p.id_prestamo, nombreUsuario(p.id_usuario), nombreEquipo(p.id_pc), nombreCurso(p.id_cursos, ""),
                ...(conPedido ? [f(p.fecha_prestamo)] : []), f(p.fecha_prevista), f(p.fecha_prestamo_devolucion), p.estado]);
  }
  // Separador ";" : así Excel en español abre cada dato en su columna.
  // Si un texto empieza con = + - @ se le antepone ' para que Excel no lo tome como fórmula.
  const celdaCsv = (c) => {
    let s = String(c ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const csv = filas.map((fila) => fila.map(celdaCsv).join(";")).join("\r\n");

  const desde = $("#r-desde").value, hasta = $("#r-hasta").value;
  const nombre = "prestamos" + ((desde || hasta) ? "_" + (desde || "inicio") + "_" + (hasta || "hoy") : "") + ".csv";
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = el("a", { href: url, download: nombre });
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);   // no revocar enseguida: algunos navegadores cortan la descarga
  Modal.exportado("Se descargó " + nombre + " con " + lista.length + (lista.length === 1 ? " préstamo." : " préstamos."));
});

// ---------- Login / logout ----------
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const camposLogin = () => [$("#login-user"), $("#login-pass")];

function limpiarEstadoCampos() {
  camposLogin().forEach((c) => c.classList.remove("campo-ok", "campo-error"));
}
// al volver a escribir se saca el rojo
camposLogin().forEach((c) => c.addEventListener("input", limpiarEstadoCampos));

// Pantalla grande de bienvenida (se crea sola, no depende del HTML ni del CSS)
function pantallaBienvenida(nombre) {
  const viejo = document.getElementById("bienvenida-grande");
  if (viejo) viejo.remove();

  const o = el("div", { id: "bienvenida-grande" },
    el("h1", { texto: "¡Bienvenido, " + nombre + "!" }),
    el("p", { texto: "Ingresando al sistema..." }));
  o.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;" +
    "align-items:center;justify-content:center;background:linear-gradient(135deg,#0a66ff 0%,#2f86ff 100%);color:#fff;text-align:center;" +
    "padding:20px;opacity:0;transition:opacity .4s ease;";
  o.querySelector("h1").style.cssText = "font-size:clamp(2.4rem,8vw,4.5rem);margin:0 0 12px;color:#fff;";
  o.querySelector("p").style.cssText = "margin:0;opacity:.75;font-size:1.1rem;color:#fff;";

  document.body.appendChild(o);
  void o.offsetWidth;          // para que se anime el fundido
  o.style.opacity = "1";
  return o;
}

// ✔ Usuario correcto: tick verde en los campos + "Bienvenido" en grande
async function entrarConBienvenida(datos) {
  const btn = $("#btn-login");
  let overlay = null;
  try {
    camposLogin().forEach((c) => c.classList.add("campo-ok"));
    btn.classList.add("btn-ok");
    btn.textContent = "✔ Usuario correcto";
    await esperar(900);

    overlay = pantallaBienvenida(datos.usuario.nombre || datos.usuario.usuario);
    await esperar(500);

    guardarSesion(datos);
    $("#form-login").reset();
    await aplicarSesion();

    await esperar(1800);
  } finally {
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 400);
    }
    limpiarEstadoCampos();
    btn.classList.remove("btn-ok");
    btn.textContent = "Iniciar sesión";
  }
}

// ✘ Usuario incorrecto: cruz roja en los campos
async function mostrarCruzError() {
  const btn = $("#btn-login");
  limpiarEstadoCampos();
  void $("#login-user").offsetWidth;   // reinicia la animación
  camposLogin().forEach((c) => c.classList.add("campo-error"));
  btn.classList.add("btn-error");
  btn.textContent = "✘ Usuario incorrecto";

  await esperar(1500);
  btn.classList.remove("btn-error");
  btn.textContent = "Iniciar sesión";
}

// (un solo submit: antes estaba repetido y el login corría dos veces)
$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = $("#login-user").value.trim();
  const contrasenia = $("#login-pass").value;   // sin trim: los espacios cuentan
  const error = $("#login-error");
  error.style.display = "none";
  limpiarEstadoCampos();
  if (usuario === "" || contrasenia === "") {
    const falta = usuario === "" ? $("#login-user") : $("#login-pass");
    error.textContent = usuario === "" ? "Escribí tu usuario" : "Escribí tu contraseña";
    error.style.display = "block";
    falta.classList.add("campo-error");
    falta.focus();
    return;
  }
  $("#btn-login").disabled = true;
  try {
    let datos;
    try {
      datos = await apiLogin({ usuario, contrasenia });
    } catch (err) {
      error.textContent = err.message;
      error.style.display = "block";
      await mostrarCruzError();
      return;
    }
    await entrarConBienvenida(datos);
  } finally {
    $("#btn-login").disabled = false;
  }
});

async function cerrarSesion() {
  cerrarMenuMovil();
  try { await apiLogout(); } catch (e) { /* cerramos igual en este navegador */ }
  cerrarSesionLocal();
  await aplicarSesion();
}
$("#btn-logout").addEventListener("click", cerrarSesion);
$("#btn-logout").addEventListener("keydown", (e) => { if (e.key === "Enter") cerrarSesion(); });

// ---------- Pantalla inicial e ingreso con cédula (estudiantes) ----------
const PANTALLAS_PUBLICAS = ["view-inicio", "view-cedula", "view-login"];

// Muestra una sola de las pantallas sin sesión (null = las oculta todas)
function mostrarPantallaPublica(id) {
  PANTALLAS_PUBLICAS.forEach((p) => $("#" + p).classList.toggle("active", p === id));
}

function resetIngresoCedula() {
  $("#form-cedula").reset();
  $("#ingreso-nuevo").hidden = true;
  $("#ingreso-error").style.display = "none";
  $("#btn-ingresar").textContent = "Ingresar";
}

$("#btn-ir-cedula").addEventListener("click", () => {
  resetIngresoCedula();
  mostrarPantallaPublica("view-cedula");
  $("#ingreso-ci").focus();
});
$("#btn-ir-admin").addEventListener("click", () => {
  $("#form-login").reset();
  $("#login-error").style.display = "none";
  limpiarEstadoCampos();
  mostrarPantallaPublica("view-login");
  $("#login-user").focus();
});
$("#btn-cedula-volver").addEventListener("click", () => { resetIngresoCedula(); mostrarPantallaPublica("view-inicio"); });
$("#btn-login-volver").addEventListener("click", () => mostrarPantallaPublica("view-inicio"));

soloNumeros($("#ingreso-ci"));
// Si corrige la cédula después de que le pedimos los datos, volvemos a empezar
$("#ingreso-ci").addEventListener("input", () => {
  if ($("#ingreso-nuevo").hidden) return;
  $("#ingreso-nuevo").hidden = true;
  $("#ingreso-error").style.display = "none";
  $("#btn-ingresar").textContent = "Ingresar";
});

$("#form-cedula").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#ingreso-error");
  const mostrarError = (texto) => { error.textContent = texto; error.style.display = "block"; };
  error.style.display = "none";

  const ci = $("#ingreso-ci").value.trim();
  const esAlta = !$("#ingreso-nuevo").hidden;   // true cuando ya le pedimos nombre y apellido
  if (!/^\d{8,9}$/.test(ci)) { mostrarError("La cédula tiene 8 o 9 números, sin puntos ni guión"); $("#ingreso-ci").focus(); return; }

  const datos = { ci };   // como texto, para no perder ceros a la izquierda
  if (esAlta) {
    const soloLetras = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]*$/;
    const nombre = $("#ingreso-nombre").value.trim();
    const apellido = $("#ingreso-apellido").value.trim();
    if (nombre.length < 3 || nombre.length > 16 || !soloLetras.test(nombre)) { mostrarError("El nombre debe tener entre 3 y 16 letras"); $("#ingreso-nombre").focus(); return; }
    if (apellido.length < 3 || apellido.length > 16 || !soloLetras.test(apellido)) { mostrarError("El apellido debe tener entre 3 y 16 letras"); $("#ingreso-apellido").focus(); return; }
    datos.nombre = nombre;
    datos.apellido = apellido;
  }

  $("#btn-ingresar").disabled = true;
  try {
    const sesion = await apiIngresoCedula(datos);
    await entrarConCedula(sesion);
  } catch (err) {
    if (err.status === 404 && !esAlta) {
      // Cédula nueva: pedimos nombre y apellido para registrarla
      $("#ingreso-nuevo").hidden = false;
      $("#btn-ingresar").textContent = "Registrarme e ingresar";
      mostrarError("Esa cédula no está registrada. Completá tu nombre y apellido.");
      $("#ingreso-nombre").focus();
    } else {
      mostrarError(err.message);
    }
  } finally {
    $("#btn-ingresar").disabled = false;
  }
});

async function entrarConCedula(datos) {
  const overlay = pantallaBienvenida(datos.usuario.nombre || datos.usuario.usuario);
  try {
    await esperar(500);
    guardarSesion(datos);
    await aplicarSesion();
    await esperar(1500);
  } finally {
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 400);
  }
}

// ---------- Pantalla según haya sesión ----------
async function aplicarSesion() {
  const u = obtenerUsuario();
  const conSesion = u !== null;

  mostrarPantallaPublica(conSesion ? null : "view-inicio");
  $("#app-system").hidden = !conSesion;

  if (!conSesion) {
    usuarios = []; equipos = []; cursos = []; prestamos = []; prestamosHistorial = [];
    resetIngresoCedula();
    $("#form-login").reset();
    $("#login-error").style.display = "none";
    limpiarEstadoCampos();
    $("#form-filtros").reset();
    mostrarFoto();
    return;
  }

  $("#user-display-name").textContent = u.nombre || u.usuario;
  // Lo que se ve en el encabezado: el "encargado" se muestra como "Usuario" (los permisos no cambian)
  const ETIQUETA_ROL = { administrador: "Administrador", encargado: "Usuario", usuario: "Usuario" };
  $("#user-display-rol").textContent = ETIQUETA_ROL[u.rol] || u.rol;
  $("#cfg-usuario").value = u.usuario;
  $("#cfg-rol").value = u.rol;
  mostrarFoto();

  // Mostrar solo lo que el rol puede usar (el backend decide de verdad)
  document.querySelectorAll("[data-puede]").forEach((n) => { n.hidden = !puede(n.dataset.puede); });
  document.querySelectorAll("[data-roles]").forEach((n) => { n.hidden = !n.dataset.roles.split(",").includes(u.rol); });

  const soyUsuario = u.rol === "usuario";
  $("#titulo-prestamo").textContent = soyUsuario ? "Pedir un equipo" : "Registrar préstamo";
  $("#titulo-historial").textContent = soyUsuario ? "Mis préstamos" : "Historial de préstamos";
  $("#aviso-prestamo").hidden = !soyUsuario;
  $("#grp-f-usuario").hidden = soyUsuario;
  $("#card-usuarios").hidden = !puede("ver_usuarios");
  $("#grp-p-usuario").hidden = pideASuNombre();
  $("#grp-p-fecha").hidden = pideASuNombre();          // el estudiante no elige fecha: se calcula sola
  $("#resumen-prestamo").hidden = !pideASuNombre();
  $("#titulo-devolucion").textContent = soyUsuario ? "Devolver un equipo" : "Registrar devolución";
  $("#aviso-historial").textContent = "";
  $("#p-fecha").min = hoyISO();
  $("#p-fecha").max = fechaMasDias(MAX_DIAS_PRESTAMO);

  irA(soyUsuario ? "view-mi-inicio" : "view-dashboard", true);
  await cargarDatos();
}

window.addEventListener("sesion-vencida", () => {
  aplicarSesion();
  mostrarMensaje("Tu sesión venció. Volvé a iniciar sesión.", true);
});

// ---------- Foto de perfil (se guarda solo en este navegador) ----------
const claveFoto = () => { const u = obtenerUsuario(); return u ? "foto-computab-" + u.id : null; };

function leerFoto() {
  const clave = claveFoto();
  if (!clave) return null;
  try { return localStorage.getItem(clave); } catch (e) { return null; }
}

function mostrarFoto() {
  const foto = leerFoto();
  for (const [img, icono] of [["#avatar-header", "#avatar-icono"], ["#perfil-img", "#perfil-icono"]]) {
    $(img).hidden = !foto;
    $(icono).hidden = !!foto;
    if (foto) $(img).src = foto;
  }
  $("#btn-quitar-foto").hidden = !foto;
  $("#btn-foto").textContent = foto ? "Cambiar foto" : "Subir foto";
}

// Recorta al centro en cuadrado y achica, para que pese poco
function reducirImagen(archivo, lado = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const corte = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = lado;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";   // fondo blanco para PNG con transparencia
      ctx.fillRect(0, 0, lado, lado);
      ctx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

$("#btn-foto").addEventListener("click", () => $("#foto-archivo").click());

$("#foto-archivo").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";   // permite volver a elegir el mismo archivo
  if (!archivo) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
    return mostrarMensaje("La foto tiene que ser JPG, PNG o WebP", true);
  }
  if (archivo.size > 8 * 1024 * 1024) {
    return mostrarMensaje("La foto pesa más de 8 MB. Elegí una más liviana", true);
  }
  try {
    const foto = await reducirImagen(archivo);
    localStorage.setItem(claveFoto(), foto);
    mostrarFoto();
    mostrarMensaje("Foto de perfil actualizada");
  } catch (error) {
    mostrarMensaje(error.message || "No se pudo guardar la foto", true);
  }
});

$("#btn-quitar-foto").addEventListener("click", () => {
  try { localStorage.removeItem(claveFoto()); } catch (e) { /* sin storage */ }
  mostrarFoto();
  mostrarMensaje("Foto de perfil quitada");
});

// ---------- Apariencia ----------
const CLAVE_TEMA = "tema-computab";
function aplicarTema(oscuro) {
  document.body.classList.toggle("dark-mode", oscuro);
  try { localStorage.setItem(CLAVE_TEMA, oscuro ? "oscuro" : "claro"); } catch (e) { /* sin storage */ }
}
$("#btn-tema").addEventListener("click", () => aplicarTema(!document.body.classList.contains("dark-mode")));

// ---------- Adaptación a celular, tablet y computadora ----------
// Celular: el menú es un panel que se abre con el botón ☰. Tablet: menú de solo iconos.
$("#btn-hamburger").addEventListener("click", () => {
  if (mqMovil.matches) cerrarMenuMovil();
  else $("#sidebar").classList.toggle("collapsed");
});
$("#btn-menu-movil").addEventListener("click", () => {
  if ($("#sidebar").classList.contains("abierto")) cerrarMenuMovil(); else abrirMenuMovil();
});
$("#menu-overlay").addEventListener("click", cerrarMenuMovil);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarMenuMovil(); });

function abrirMenuMovil() {
  $("#sidebar").classList.add("abierto");
  $("#menu-overlay").hidden = false;
  $("#btn-menu-movil").setAttribute("aria-expanded", "true");
}
function cerrarMenuMovil() {
  $("#sidebar").classList.remove("abierto");
  $("#menu-overlay").hidden = true;
  $("#btn-menu-movil").setAttribute("aria-expanded", "false");
}
function ajustarMenu() {
  const sidebar = $("#sidebar");
  if (mqMovil.matches) sidebar.classList.remove("collapsed");
  else { sidebar.classList.toggle("collapsed", mqTablet.matches); cerrarMenuMovil(); }
}
mqMovil.addEventListener("change", ajustarMenu);
mqTablet.addEventListener("change", ajustarMenu);

// En pantallas angostas cada fila de las tablas se ve como una tarjeta:
// a cada celda se le pone el nombre de su columna (data-label)
function etiquetarFilas(tbody) {
  const titulos = [...tbody.closest("table").querySelectorAll("thead th")].map((th) => th.textContent.trim());
  for (const tr of tbody.children) {
    [...tr.children].forEach((td, i) => { if (!td.colSpan || td.colSpan === 1) td.dataset.label = titulos[i] ?? ""; });
  }
}
const observadorTablas = new MutationObserver((cambios) => cambios.forEach((c) => etiquetarFilas(c.target)));
document.querySelectorAll("tbody").forEach((tb) => observadorTablas.observe(tb, { childList: true }));

document.addEventListener("DOMContentLoaded", () => {
  ajustarMenu();
  try { if (localStorage.getItem(CLAVE_TEMA) === "oscuro") aplicarTema(true); } catch (e) { /* sin storage */ }
  aplicarSesion();
});