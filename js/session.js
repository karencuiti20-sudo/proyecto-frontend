const CLAVE_SESION = "sesion-computab";

// Roles del backend (auth.php), de menos a más permisos
const ROLES = ["usuario", "encargado", "administrador"];

// Solo decide qué mostrar. El que decide de verdad es el backend.
const PERMISOS = {
  ver_prestamos:  ["usuario", "encargado", "administrador"], // el usuario ve solo los suyos
  crear_prestamo: ["usuario", "encargado", "administrador"],
  devolver:       ["usuario", "encargado", "administrador"], // el usuario solo los suyos
  editar:         ["encargado", "administrador"],
  eliminar:       ["administrador"],
  ver_usuarios:   ["encargado", "administrador"],
  editar_usuario: ["administrador"],
  ver_reportes:   ["encargado", "administrador"],
  crear_equipo:   ["encargado", "administrador"],
  ver_cursos:     ["encargado", "administrador"],
  editar_curso:   ["encargado", "administrador"]   // eliminar un curso usa el permiso "eliminar" (solo administrador)
};

// Guarda lo que devolvió login.php: { token, expira_en, usuario: {id, usuario, rol} }
function guardarSesion(datos) {
  if (!datos || !datos.token || !datos.usuario) {
    throw new Error("El servidor no devolvió una sesión válida");
  }
  localStorage.setItem(CLAVE_SESION, JSON.stringify({
    token: datos.token,
    usuario: datos.usuario,
    vence: Date.now() + datos.expira_en * 1000
  }));
}

function leerSesion() {
  try {
    const sesion = JSON.parse(localStorage.getItem(CLAVE_SESION));
    if (sesion && sesion.token && sesion.usuario && Date.now() < sesion.vence) {
      return sesion;
    }
  } catch (error) {
    // JSON dañado: se trata como "sin sesión"
  }
  localStorage.removeItem(CLAVE_SESION);
  return null;
}

function obtenerToken() {
  const s = leerSesion();
  return s ? s.token : null;
}

function obtenerUsuario() {
  const s = leerSesion();
  return s ? s.usuario : null;
}

function cerrarSesionLocal() {
  localStorage.removeItem(CLAVE_SESION);
}

function puede(accion) {
  const u = obtenerUsuario();
  return u !== null && (PERMISOS[accion] || []).includes(u.rol);
}