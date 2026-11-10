async function request(url, opciones = {}) {
  const { publico = false, ...resto } = opciones;
  const config = { ...resto, headers: {} };

  if (resto.body) {
    config.headers["Content-Type"] = "application/json";
  }
  const token = obtenerToken();
  if (token && !publico) {
    config.headers["Authorization"] = "Bearer " + token;
  }

  let respuesta;
  try {
    respuesta = await fetch(url, config);
  } catch (error) {
    throw new Error("No se pudo conectar con el servidor (¿está encendido? ¿URL de config.js? Mirá F12 → Console)");
  }

  // Leemos como texto para poder avisar si el servidor no devolvió JSON
  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch (error) {
    if (respuesta.ok) {
      console.error("Respuesta no JSON de " + url + ":\n", texto);
      throw new Error("El servidor no devolvió JSON (probablemente un error de PHP). Mirá F12 → Network → Response");
    }
  }

  if (!respuesta.ok) {
    if (respuesta.status === 401 && !publico) {
      cerrarSesionLocal();
      window.dispatchEvent(new Event("sesion-vencida"));
    }
    const e = new Error((datos && (datos.error || datos.mensaje)) || "Error HTTP " + respuesta.status);
    e.status = respuesta.status;
    throw e;
  }
  return datos;
}

function construirUrl(base, filtros = {}) {
  const params = new URLSearchParams();
  for (const clave in filtros) {
    const valor = String(filtros[clave]).trim();
    if (valor !== "") params.append(clave, valor);
  }
  const query = params.toString();
  return query ? base + "?" + query : base;
}

// ---- Auth ----
// POST /login.php { usuario, contrasenia } -> { token, expira_en, usuario }
const apiLogin = (credenciales) =>
  request(LOGIN_URL, { method: "POST", body: JSON.stringify(credenciales), publico: true });

// POST /ingreso.php { ci }                        -> inicia sesión (rol usuario); 404 si la cédula no existe
// POST /ingreso.php { ci, nombre, apellido }      -> registra al estudiante nuevo e inicia sesión
// Responde igual que login.php: { token, expira_en, usuario: {id, usuario, nombre, rol}, nuevo }
const apiIngresoCedula = (datos) =>
  request(INGRESO_URL, { method: "POST", body: JSON.stringify(datos), publico: true });

// DELETE /login.php -> borra el token en el servidor
const apiLogout = () => request(LOGIN_URL, { method: "DELETE" });

// ---- Préstamos ----
// Si se filtra por id_prestamo la API devuelve UN objeto: lo metemos en un array
async function apiListarPrestamos(filtros = {}) {
  try {
    const datos = await request(construirUrl(PRESTAMOS_URL, filtros));
    return Array.isArray(datos) ? datos : [datos];
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

const apiCrearPrestamo = (p) =>
  request(PRESTAMOS_URL, { method: "POST", body: JSON.stringify(p) });

const apiDevolverPrestamo = (id) =>
  request(PRESTAMOS_URL + "?id_prestamo=" + encodeURIComponent(id) + "&accion=devolver", { method: "PUT" });

const apiEliminarPrestamo = (id) =>
  request(PRESTAMOS_URL + "?id_prestamo=" + encodeURIComponent(id), { method: "DELETE" });

// GET prestamos.php?vencidos=1 -> { total, prestamos: [...] } (solo administrador y encargado)
// Cada préstamo trae: id_prestamo, fecha_prevista, dias_atraso, ci, nombre, apellido, inventario, marca, modelo
const apiListarVencidos = () => request(PRESTAMOS_URL + "?vencidos=1");

// ---- Equipos ----
const apiListarEquipos = () => request(EQUIPOS_URL);

const apiCrearEquipo = (e) =>
  request(EQUIPOS_URL, { method: "POST", body: JSON.stringify(e) });

// Mismo estilo que prestamos.php: el id va en la URL (?id_pc=...)
const apiEditarEquipo = (id, datos) =>
  request(EQUIPOS_URL + "?id_pc=" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(datos) });

const apiEliminarEquipo = (id) =>
  request(EQUIPOS_URL + "?id_pc=" + encodeURIComponent(id), { method: "DELETE" });

// ---- Usuarios ----
const apiListarUsuarios = () => request(USUARIOS_URL);

// POST usuarios.php { ci, nombre, apellido, usuario, contrasenia, rol } -> { id_usuario, rol }
const apiCrearUsuario = (datos) =>
  request(USUARIOS_URL, { method: "POST", body: JSON.stringify(datos) });

// ---- Cursos ----
// cursos.php: GET (lista), POST, PUT ?id_cursos=ID, DELETE ?id_cursos=ID
// Cada curso: { id_cursos, nombre, descripcion, tipo_cursos }
const apiListarCursos = () => request(CURSOS_URL);

const apiCrearCurso = (c) =>
  request(CURSOS_URL, { method: "POST", body: JSON.stringify(c) });

const apiEditarCurso = (id, datos) =>
  request(CURSOS_URL + "?id_cursos=" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(datos) });

const apiEliminarCurso = (id) =>
  request(CURSOS_URL + "?id_cursos=" + encodeURIComponent(id), { method: "DELETE" });

// ---- Teléfonos ----
// GET telefono.php?id_usuario=ID -> teléfonos de ese usuario (puede venir un objeto o una lista)
async function apiListarTelefonosDeUsuario(idUsuario) {
  try {
    const datos = await request(construirUrl(TELEFONOS_URL, { id_usuario: idUsuario }));
    if (Array.isArray(datos)) return datos;
    return datos ? [datos] : [];
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

// POST telefono.php   Body: { "id_usuario": 1, "numero": "099123456" } -> { id_telefono }
const apiCrearTelefono = (datos) =>
  request(TELEFONOS_URL, { method: "POST", body: JSON.stringify(datos) });

// PUT telefono.php?id_telefono=ID   Body: { "numero": "099123456" }
const apiEditarTelefono = (id, datos) =>
  request(TELEFONOS_URL + "?id_telefono=" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(datos) });

// Mismo estilo que equipos.php: el id va en la URL (?id_usuario=...)
const apiEditarUsuario = (id, datos) =>
  request(USUARIOS_URL + "?id_usuario=" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(datos) });