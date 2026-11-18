// Aviso de alertas pendientes (rack abierto, etc.) para administrador / encargado.
// Consulta GET alerta.php?atendida=0 cada pocos segundos y avisa cuando llega una nueva.
// Se carga después de app.js y vencidos.js. Crea su propia caja en el dashboard.
(function () {
  const INTERVALO_MS = 10 * 1000; // para la demo; en uso real alcanza con 30 s
  const URL_ALERTAS = typeof ALERTAS_URL !== "undefined" ? ALERTAS_URL : API_BASE + "/alerta.php";
  const TIPOS = {
    extraccion_no_autorizada: "Rack abierto / extracción no autorizada",
    falta_devolucion: "Falta de devolución"
  };

  let temporizador = null;
  const inventarios = new Map(); // id_pc -> inventario (para filtrar el listado de equipos al hacer clic)
  let vistas = null; // ids ya vistos; null hasta la primera consulta (así no suena por alertas viejas)

  const app = document.getElementById("app-system");
  const dashboard = document.getElementById("view-dashboard");
  if (!app || !dashboard) return;

  // ---- Caja en el dashboard (arriba del aviso de vencidos) ----
  const caja = document.createElement("section");
  caja.className = "aviso-alertas";
  caja.id = "aviso-alertas";
  caja.setAttribute("role", "alert");
  caja.hidden = true;
  caja.innerHTML =
    '<h3><i class="fas fa-bell"></i> <span id="alertas-total">0</span> <span id="alertas-titulo">alertas sin atender</span></h3>' +
    '<div class="tabla-scroll"><table class="data-table"><thead><tr>' +
    "<th>N°</th><th>Tipo</th><th>Equipo</th><th>Usuario</th><th>Fecha</th><th></th>" +
    '</tr></thead><tbody id="alertas-body"></tbody></table></div>';
  const referencia = document.getElementById("aviso-vencidos");
  if (referencia && referencia.parentNode === dashboard) dashboard.insertBefore(caja, referencia);
  else dashboard.prepend(caja);
  const cuerpo = document.getElementById("alertas-body");

  // "2026-11-12 15:30:00" -> "12/11/2026 15:30"
  function fechaHora(t) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(t || "");
    return m ? m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5] : t || "";
  }

  function celda(texto) {
    const td = document.createElement("td");
    td.textContent = texto;
    return td;
  }

  // Pitido corto para que se note aunque no estén mirando la pantalla
  function pitido() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) { /* sin audio: no pasa nada */ }
  }

  // ---- ¿Quién tenía el equipo cuando saltó la alerta? ----
  // Se cruza la alerta con los préstamos de ese equipo: el que estaba prestado (sin devolver,
  // o devuelto después de la alerta) y ya iniciado ese día es quien lo levantó.
  const dia = (t) => String(t || "").slice(0, 10);

  async function cargarContexto() {
    const [rEq, rPr, rUs] = await Promise.allSettled([
      nombresDeEquipos(), apiListarPrestamos({}), apiListarUsuarios()
    ]);
    return {
      equipos: rEq.status === "fulfilled" ? rEq.value : new Map(),
      prestamos: rPr.status === "fulfilled" ? rPr.value : [],
      usuarios: new Map((rUs.status === "fulfilled" ? rUs.value : []).map((u) => [Number(u.id_usuario), u]))
    };
  }

  function prestamoDeLaAlerta(a, prestamos) {
    const dAlerta = dia(a.fecha_alerta);
    const candidatos = prestamos.filter((p) => {
      if (Number(p.id_pc) !== Number(a.fk_id_pc)) return false;
      if (p.fecha_prestamo && dia(p.fecha_prestamo) > dAlerta) return false;   // todavía no lo había pedido
      const devuelto = String(p.estado).toLowerCase() === "devuelto";
      if (!devuelto) return true;
      const dev = dia(p.fecha_prestamo_devolucion);
      return dev === "" || dev >= dAlerta;                                       // lo devolvió después de la alerta
    });
    candidatos.sort((x, y) => Number(y.id_prestamo) - Number(x.id_prestamo));    // el más reciente
    return candidatos[0] || null;
  }

  // Devuelve la celda "Usuario": nombre + cédula, o "Sin préstamo activo" si nadie lo tenía pedido
  function celdaUsuario(a, ctx) {
    const td = document.createElement("td");
    const p = prestamoDeLaAlerta(a, ctx.prestamos);
    if (!p) {
      td.textContent = "Sin préstamo activo";
      td.className = "sin-prestamo";
      td.title = "Nadie tenía este equipo prestado: posible extracción no autorizada";
      return { td, prestamo: null };
    }
    const u = ctx.usuarios.get(Number(p.id_usuario));
    const nombre = u ? ([u.nombre, u.apellido].filter(Boolean).join(" ") || u.usuario) : "Usuario N° " + p.id_usuario;
    td.textContent = nombre + (u && u.ci ? " · CI " + u.ci : "");
    td.title = "Préstamo N° " + p.id_prestamo;
    return { td, prestamo: p };
  }

  function ocultar() { caja.hidden = true; }

  async function nombresDeEquipos() {
    try {
      const equipos = await apiListarEquipos();
      const mapa = new Map();
      for (const e of equipos) {
        const nombre = [e.marca, e.modelo].filter(Boolean).join(" ");
        inventarios.set(Number(e.id_pc), e.inventario || "");
        mapa.set(Number(e.id_pc), (nombre + (e.inventario ? " (" + e.inventario + ")" : "")).trim());
      }
      return mapa;
    } catch (e) {
      return new Map();
    }
  }

  async function atender(id, boton) {
    boton.disabled = true;
    try {
      await request(URL_ALERTAS + "?id_alerta=" + encodeURIComponent(id), {
        method: "PUT",
        body: JSON.stringify({ atendida: true })
      });
      Aviso.mostrar("Alerta N° " + id + " marcada como atendida");
      actualizar();
    } catch (e) {
      boton.disabled = false;
      Aviso.mostrar(e.message, true);
    }
  }

  async function actualizar() {
    if (typeof obtenerToken === "function" && !obtenerToken()) return ocultar();
    if (typeof puede === "function" && !puede("ver_usuarios")) return ocultar();

    let alertas;
    try {
      alertas = await request(URL_ALERTAS + "?atendida=0");
    } catch (e) {
      return ocultar(); // 403, sin conexión, sesión vencida...
    }
    if (!Array.isArray(alertas) || alertas.length === 0) {
      vistas = new Set();
      return ocultar();
    }

    const nuevas = vistas === null ? [] : alertas.filter((a) => !vistas.has(a.id_alerta));
    vistas = new Set(alertas.map((a) => a.id_alerta));

    const ctx = await cargarContexto();
    const equipos = ctx.equipos;
    cuerpo.replaceChildren();
    for (const a of alertas) {
      const fila = document.createElement("tr");
      fila.className = "fila-alerta";
      fila.tabIndex = 0;
      fila.setAttribute("role", "link");
      fila.title = a.tipo === "falta_devolucion" ? "Ir a registrar la devolución" : "Ir al equipo en el inventario";
      fila.dataset.tipo = a.tipo;
      fila.dataset.idPc = a.fk_id_pc;
      const quien = celdaUsuario(a, ctx);
      if (quien.prestamo) fila.dataset.idPrestamo = quien.prestamo.id_prestamo;
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-outline";
      btn.textContent = "Marcar atendida";
      btn.addEventListener("click", () => atender(a.id_alerta, btn));
      td.appendChild(btn);
      fila.append(
        celda(a.id_alerta),
        celda(TIPOS[a.tipo] || a.tipo),
        celda(equipos.get(Number(a.fk_id_pc)) || "Equipo " + a.fk_id_pc),
        quien.td,
        celda(fechaHora(a.fecha_alerta)),
        td
      );
      cuerpo.appendChild(fila);
    }

    document.getElementById("alertas-total").textContent = alertas.length;
    document.getElementById("alertas-titulo").textContent =
      alertas.length === 1 ? "alerta sin atender" : "alertas sin atender";
    caja.hidden = false;

    if (nuevas.length) {
      pitido();
      Aviso.mostrar("🚨 Nueva alerta: " + (TIPOS[nuevas[0].tipo] || nuevas[0].tipo), true, 8000);
    }
  }

  // ---- Clic (o Enter) en una alerta: te lleva a lo que hay que revisar ----
  async function irADevolucion(idPc, idPrestamo) {
    if (typeof irA !== "function") return;
    let id = idPrestamo;
    if (!id) {
      try {
        const todos = await apiListarPrestamos({});
        const p = todos.find((x) => Number(x.id_pc) === Number(idPc) && String(x.estado).toLowerCase() !== "devuelto");
        id = p && p.id_prestamo;
      } catch (e) { /* si falla, igual abrimos la pantalla */ }
    }
    irA("view-registrar-devolucion");
    const select = document.getElementById("d-prestamo");
    if (id && select) {
      select.value = id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.focus();
    } else {
      Aviso.mostrar("Ese equipo ya no tiene un préstamo activo", true);
    }
  }

  function irAlEquipo(idPc) {
    if (typeof irA !== "function") return;
    if (typeof filtrarEquipos === "function") filtrarEquipos("");   // limpia filtros anteriores
    const buscar = document.getElementById("q-texto");
    if (buscar) buscar.value = inventarios.get(Number(idPc)) || "";
    if (typeof dibujarEquipos === "function") dibujarEquipos();
    irA("view-pc");
  }

  function irAAlerta(fila) {
    if (fila.dataset.tipo === "falta_devolucion") irADevolucion(fila.dataset.idPc, fila.dataset.idPrestamo);
    else irAlEquipo(fila.dataset.idPc);
  }

  cuerpo.addEventListener("click", function (e) {
    if (e.target.closest("button")) return;        // "Marcar atendida" no navega
    const fila = e.target.closest("tr.fila-alerta");
    if (fila) irAAlerta(fila);
  });
  cuerpo.addEventListener("keydown", function (e) {
    if (e.target.closest("button")) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const fila = e.target.closest("tr.fila-alerta");
    if (!fila) return;
    e.preventDefault();
    irAAlerta(fila);
  });

  function iniciar() {
    actualizar();
    if (temporizador === null) temporizador = setInterval(actualizar, INTERVALO_MS);
  }

  function detener() {
    if (temporizador !== null) { clearInterval(temporizador); temporizador = null; }
    vistas = null;
    ocultar();
  }

  new MutationObserver(function () {
    if (app.hidden) detener(); else iniciar();
  }).observe(app, { attributes: true, attributeFilter: ["hidden"] });

  if (!app.hidden) iniciar();
})();