// ============================================================
// Puente Arduino (puerto serie) -> API PHP de CompuTab
//
// Instalar (una sola vez):   npm install serialport
// Probar la API sin Arduino: node puente.js --simular
// Uso normal:                node puente.js
//   (cerrá antes el Serial Monitor del Arduino IDE)
// Necesita Node 18 o más nuevo (por fetch):  node -v
// ============================================================
const { SerialPort, ReadlineParser } = require("serialport");

// ---------- CONFIGURACIÓN (lo único que hay que tocar) ----------
const PUERTO = process.env.COMPUTAB_PUERTO || "COM3"; // Linux/Mac: /dev/ttyACM0 o /dev/ttyUSB0
const API_BASE = process.env.COMPUTAB_API || "http://127.0.0.1:8080"; // igual que config.js
const USUARIO = process.env.COMPUTAB_USUARIO || "admin";
const CONTRASENIA = process.env.COMPUTAB_CLAVE || "TU_CONTRASENIA";
const ID_PC = Number(process.env.COMPUTAB_ID_PC || 1); // id_pc (tabla Equipos) que vigila el sensor
const TIPO_ALERTA = "extraccion_no_autorizada";        // o "falta_devolucion"
// -----------------------------------------------------------------

const LOGIN_URL = API_BASE + "/login.php";
const ALERTA_URL = API_BASE + "/alerta.php";

if (typeof fetch !== "function") {
  console.error("Tu Node es muy viejo (no tiene fetch). Instalá Node 18 o más nuevo.");
  process.exit(1);
}

let token = null;

// POST /login.php { usuario, contrasenia } -> { token, expira_en, usuario }
async function login() {
  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: USUARIO, contrasenia: CONTRASENIA }),
  });
  const texto = await res.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch (e) { /* no era JSON */ }
  if (!res.ok || !datos || !datos.token) {
    throw new Error("Login falló (HTTP " + res.status + "): " + texto.slice(0, 200));
  }
  token = datos.token;
  console.log("Login OK como", (datos.usuario && datos.usuario.usuario) || USUARIO);
}

// POST /alerta.php { id_pc, tipo } con Authorization: Bearer <token>
function enviarAlerta() {
  return fetch(ALERTA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ id_pc: ID_PC, tipo: TIPO_ALERTA }),
  });
}

async function registrarAlerta() {
  try {
    if (!token) await login();
    let res = await enviarAlerta();
    if (res.status === 401) {          // token vencido: nuevo login y un reintento
      await login();
      res = await enviarAlerta();
    }
    console.log("Alerta enviada -> HTTP " + res.status, await res.text());
  } catch (err) {
    console.error("No se pudo registrar la alerta:", err.message);
  }
}

// ---------- Modo prueba sin Arduino ----------
if (process.argv.includes("--simular")) {
  console.log("Modo simulación: mando una alerta de prueba...");
  registrarAlerta();
  return;
}

// ---------- Modo normal: leer el Arduino ----------
const port = new SerialPort({ path: PUERTO, baudRate: 9600 }, (err) => {
  if (!err) return;
  console.error("No se pudo abrir " + PUERTO + ": " + err.message);
  console.error("¿Está bien el puerto? ¿Está cerrado el Serial Monitor? Puertos disponibles:");
  SerialPort.list().then((lista) => {
    lista.forEach((p) => console.error("  - " + p.path + (p.manufacturer ? " (" + p.manufacturer + ")" : "")));
    process.exit(1);
  });
});

const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

// Una sola alerta por apertura: si el Arduino repite PUERTA_ABIERTA mientras sigue abierta, se ignora.
// Se vuelve a "armar" cuando llega PUERTA_CERRADA.
let abierta = false;

parser.on("data", (linea) => {
  linea = linea.trim();
  console.log("Arduino dice:", linea);
  if (linea.includes("PUERTA_ABIERTA")) {
    if (abierta) { console.log("  (ya avisé de esta apertura, no se repite)"); return; }
    abierta = true;
    registrarAlerta();
  } else if (linea.includes("PUERTA_CERRADA")) {
    abierta = false;
  }
});

port.on("error", (err) => console.error("Error del puerto:", err.message));