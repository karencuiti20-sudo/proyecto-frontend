// Modales de confirmación y avisos breves de CompuTab.
// Usa Font Awesome (ya cargado en index.html). Cargar ANTES de app.js.
//
//   Modal.agregado(texto)        -> éxito, se cierra solo
//   Modal.editado(texto)         -> cambios guardados
//   await Modal.eliminar("el equipo PC-01")  -> true si confirmó, false si canceló
//   await Modal.error(texto)     -> true si tocó "Reintentar"
//   Aviso.mostrar(texto, esError) -> cartel chico arriba a la derecha

const Modal = {
  // Devuelve una promesa con el "valor" del botón tocado (false si cierra con Esc o clic afuera)
  mostrar({ tipo = "ok", icono = "fa-check", titulo, texto, auto = 0, grande = false, botones = [{ texto: "Aceptar", valor: true }] }) {
    return new Promise((resolver) => {
      const previo = document.activeElement;
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML =
        '<div class="modal-caja modal-' + tipo + (grande ? " modal-grande" : "") + '" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">' +
          '<span class="modal-icono"><i class="fas ' + icono + '"></i></span>' +
          '<h2 id="modal-titulo"></h2><p class="modal-texto"></p>' +
          (auto ? '<div class="modal-progreso"><i style="animation-duration:' + auto + 'ms"></i></div>' : "") +
          '<div class="modal-acciones"></div>' +
        "</div>";
      overlay.querySelector("h2").textContent = titulo;
      overlay.querySelector(".modal-texto").textContent = texto;

      let timer;
      const cerrar = (valor) => {
        clearTimeout(timer);
        document.removeEventListener("keydown", alTeclear);
        overlay.remove();
        if (previo && previo.focus) previo.focus();
        resolver(valor);
      };
      const alTeclear = (e) => { if (e.key === "Escape") cerrar(false); };

      const contenedor = overlay.querySelector(".modal-acciones");
      botones.forEach((b) => {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "btn btn-outline";
        boton.textContent = b.texto;
        boton.addEventListener("click", () => cerrar(b.valor));
        contenedor.appendChild(boton);
      });
      overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(false); });

      document.body.appendChild(overlay);
      document.addEventListener("keydown", alTeclear);
      // En "eliminar" el foco empieza en Cancelar para no borrar de casualidad con Enter
      const foco = tipo === "danger" ? 0 : botones.length - 1;
      contenedor.children[foco].focus();
      if (auto) timer = setTimeout(() => cerrar(null), auto);
    });
  },

  agregado(texto = "El equipo se registró correctamente en el inventario.", grande = false) {
    return Modal.mostrar({ tipo: "ok", icono: "fa-check", titulo: "Se ha agregado", texto, auto: 4000, grande });
  },

  editado(texto = "Los cambios del registro se guardaron.") {
    return Modal.mostrar({ tipo: "info", icono: "fa-pen", titulo: "Se ha editado", texto });
  },

  // objeto: texto que sigue a "¿Eliminar ...?", por ejemplo "el equipo PC-01"
  eliminar(objeto) {
    return Modal.mostrar({
      tipo: "danger", icono: "fa-trash", titulo: "¿Eliminar " + objeto + "?", grande: true,
      texto: "El registro se eliminará y no se puede recuperar.",
      botones: [{ texto: "Cancelar", valor: false }, { texto: "Aceptar", valor: true }]
    });
  },

  // Pregunta antes de una acción que no es borrar. Devuelve true si confirmó.
  confirmar(titulo, texto) {
    return Modal.mostrar({
      tipo: "info", icono: "fa-rotate-left", titulo, texto, grande: true,
      botones: [{ texto: "Cancelar", valor: false }, { texto: "Aceptar", valor: true }]
    });
  },

  // Antes de abrir la ventana de impresión (Exportar PDF). Devuelve true si tocó "Continuar".
  confirmarPdf() {
    return Modal.mostrar({
      tipo: "info", icono: "fa-file-pdf", titulo: "Exportar a PDF", grande: true,
      texto: "Se va a abrir la ventana de impresión. Elegí «Guardar como PDF» y activá «Gráficos de fondo» para que se vean los colores.",
      botones: [{ texto: "Cancelar", valor: false }, { texto: "Continuar", valor: true }]
    });
  },

  exportado(texto) {
    return Modal.mostrar({ tipo: "ok", icono: "fa-file-excel", titulo: "Se ha exportado", texto, auto: 4000, grande: true });
  },

  sinDatos(texto = "Todavía no hay préstamos registrados.") {
    return Modal.mostrar({ tipo: "warn", icono: "fa-circle-info", titulo: "No hay nada para exportar", texto, grande: true });
  },

  devuelto(texto = "La devolución se registró correctamente.") {
    return Modal.mostrar({ tipo: "ok", icono: "fa-check", titulo: "Se ha devuelto", texto, auto: 4000, grande: true });
  },

  error(texto = "Revisá los datos e intentá de nuevo.", titulo = "No se pudo guardar") {
    return Modal.mostrar({
      tipo: "warn", icono: "fa-triangle-exclamation", titulo, texto, grande: true,
      botones: [{ texto: "Cancelar", valor: false }, { texto: "Reintentar", valor: true }]
    });
  }
};

const Aviso = {
  mostrar(texto, esError = false, ms = 4000) {
    let cont = document.getElementById("mensajes");
    if (!cont) {
      cont = document.createElement("div");
      cont.id = "mensajes";
      cont.setAttribute("aria-live", "polite");
      document.body.appendChild(cont);
    }
    const aviso = document.createElement("div");
    aviso.className = esError ? "mensaje error" : "mensaje";
    const icono = document.createElement("i");
    icono.className = "fas " + (esError ? "fa-circle-exclamation" : "fa-circle-check");
    const span = document.createElement("span");
    span.textContent = texto;
    aviso.append(icono, span);
    cont.appendChild(aviso);
    setTimeout(() => aviso.remove(), ms);
  }
};