// Dirección donde corre el backend PHP.
//   php -S localhost:3000 (desde la carpeta del back)  -> "http://localhost:3000"
//   XAMPP                                              -> "http://localhost:8080/NOMBRE_CARPETA"
const API_BASE = "http://127.0.0.1:8080";
const LOGIN_URL     = API_BASE + "/login.php";
const INGRESO_URL   = API_BASE + "/ingresos.php";   // ingreso del estudiante solo con la cédula
const PRESTAMOS_URL = API_BASE + "/prestamos.php";
const EQUIPOS_URL   = API_BASE + "/equipos.php";
const USUARIOS_URL  = API_BASE + "/usuarios.php";
const TELEFONOS_URL = API_BASE + "/telefono.php";
const CURSOS_URL    = API_BASE + "/cursos.php";

// Reglas del préstamo (las usa el front para sugerir y validar fechas)
// Tienen que ser iguales a DIAS_PRESTAMO y DIAS_MAXIMOS de prestamos.php
const DIAS_PRESTAMO     = 2;    // la devolución se calcula sola: hoy + estos días
const MAX_DIAS_PRESTAMO = 8;   // un préstamo no puede pasar de estos días