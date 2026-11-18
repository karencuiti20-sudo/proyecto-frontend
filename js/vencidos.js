// Aviso para administrador / encargado: préstamos que no se devolvieron en la fecha prevista.
// Usa apiListarVencidos() de api.js  ->  GET prestamos.php?vencidos=1
// Se carga después de app.js. No toca el resto de la aplicación.
(function () {
  const INTERVALO_MS = 5 * 60 * 1000; // vuelve a consultar cada 5 minutos
  const SIN_CURSO = "—";
  let temporizador = null;

  // "2026-11-05 23:59:59" -> "05/11/2026"
  function fechaCorta(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto || "");
    return m ? m[3] + "/" + m[2] + "/" + m[1] : texto || "";
  }

  function celda(texto, clase) {
    const td = document.createElement("td");
    td.textContent = texto;
    if (clase) td.className = clase;
    return td;
  }

  function ocultar() {
    const caja = document.getElementById("aviso-vencidos");
    if (caja) caja.hidden = true;
  }

  // Si el backend ya manda "curso" en cada préstamo vencido, no hace falta consultar nada más.
  // Si no lo manda, se arma un mapa id_prestamo -> "Gastronomía · 2do año" con los préstamos y cursos.
  async function mapaDeCursos(vencidos) {
    if (vencidos.every((p) => p.curso !== undefined)) return {};
    try {
      const [todos, cursos] = await Promise.all([apiListarPrestamos({}), apiListarCursos()]);
      const textoCurso = new Map(
        cursos.map((c) => [Number(c.id_cursos), [c.nombre, c.descripcion].filter(Boolean).join(" · ")])
      );
      const mapa = {};
      for (const p of todos) {
        if (p.id_cursos !== null && p.id_cursos !== undefined) {
          mapa[p.id_prestamo] = textoCurso.get(Number(p.id_cursos)) || SIN_CURSO;
        }
      }
      return mapa;
    } catch (e) {
      return {};   // sin curso antes que romper el aviso
    }
  }

  const cursoDe = (p, mapa) => (p.curso !== undefined ? p.curso : mapa[p.id_prestamo]) || SIN_CURSO;

  async function actualizar() {
    const caja = document.getElementById("aviso-vencidos");
    const cuerpo = document.getElementById("vencidos-body");
    const total = document.getElementById("vencidos-total");
    const titulo = document.getElementById("vencidos-titulo");
    if (!caja || !cuerpo || !total) return;
    if (typeof obtenerToken === "function" && !obtenerToken()) return ocultar();
    // Solo administrador y encargado ven esta alerta: el rol "usuario" nunca
    if (typeof puede === "function" && !puede("ver_usuarios")) return ocultar();

    let r;
    try {
      r = await apiListarVencidos();
    } catch (e) {
      // 403 si es estudiante, sin conexión, sesión vencida, etc.: no mostramos nada
      return ocultar();
    }

    if (!r || !r.total) return ocultar();

    const cursos = await mapaDeCursos(r.prestamos);

    cuerpo.replaceChildren();
    for (const p of r.prestamos) {
      const fila = document.createElement("tr");
      fila.className = "fila-vencido";
      fila.tabIndex = 0;
      fila.setAttribute("role", "link");
      fila.title = "Ir a registrar la devolución";
      fila.dataset.idPrestamo = p.id_prestamo;
      const dias = Number(p.dias_atraso);
      fila.append(
        celda(p.id_prestamo),
        celda(p.nombre + " " + p.apellido),
        celda(p.ci),
        celda(cursoDe(p, cursos)),
        celda(p.marca + " " + p.modelo + " (" + p.inventario + ")"),
        celda(fechaCorta(p.fecha_prevista)),
        celda(dias + (dias === 1 ? " día" : " días"), "atraso")
      );
      cuerpo.appendChild(fila);
    }

    total.textContent = r.total;
    if (titulo) {
      titulo.textContent = r.total === 1
        ? "préstamo sin devolver fuera de fecha"
        : "préstamos sin devolver fuera de fecha";
    }
    caja.hidden = false;
  }

  function iniciar() {
    actualizar();
    if (temporizador === null) temporizador = setInterval(actualizar, INTERVALO_MS);
  }

  function detener() {
    if (temporizador !== null) {
      clearInterval(temporizador);
      temporizador = null;
    }
    ocultar();
  }

  const app = document.getElementById("app-system");
  if (!app) return;

  // El sistema se muestra al iniciar sesión (se le quita "hidden") y se oculta al cerrarla
  new MutationObserver(function () {
    if (app.hidden) detener();
    else iniciar();
  }).observe(app, { attributes: true, attributeFilter: ["hidden"] });

  // Si la página se recarga con la sesión ya iniciada
  if (!app.hidden) iniciar();

  // Click (o Enter) en un préstamo vencido: abre "Registrar devolución" con ese préstamo ya elegido
  function irADevolucion(fila) {
    const id = fila.dataset.idPrestamo;
    if (typeof irA !== "function") return;
    irA("view-registrar-devolucion");
    const select = document.getElementById("d-prestamo");
    if (select) {
      select.value = id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      // Si el préstamo no está en la lista (ya fue devuelto), queda en "Elegí un préstamo"
      select.focus();
    }
  }
  const cuerpoVencidos = document.getElementById("vencidos-body");
  cuerpoVencidos.addEventListener("click", function (e) {
    const fila = e.target.closest("tr.fila-vencido");
    if (fila) irADevolucion(fila);
  });
  cuerpoVencidos.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const fila = e.target.closest("tr.fila-vencido");
    if (!fila) return;
    e.preventDefault();
    irADevolucion(fila);
  });

  // Al volver al dashboard o después de registrar una devolución, se actualiza la lista
  document.addEventListener("click", function (e) {
    if (e.target.closest('[data-ir="view-dashboard"], #btn-volver')) {
      setTimeout(actualizar, 300);
    }
  });
  document.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "form-devolucion") setTimeout(actualizar, 1000);
  });
})();