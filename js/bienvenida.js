// Muestra el tick de "usuario correcto" y el "Bienvenido" grande
// cuando el login fue exitoso y se abre el sistema.
(function () {
  const form = document.getElementById('form-login');
  const app = document.getElementById('app-system');
  const overlay = document.getElementById('bienvenida');
  const texto = document.getElementById('bienvenida-texto');

  if (!form || !app || !overlay || !texto) return;

  const DURACION_MS = 2600;   // cuánto dura la pantalla de bienvenida
  let esperandoLogin = false; // true solo si el usuario apretó "Iniciar sesión"
  let mostrando = false;
  let usuarioTipeado = '';

  // Marcamos que se intentó loguear (así no aparece al recargar la página)
  form.addEventListener('submit', function () {
    esperandoLogin = true;
    usuarioTipeado = (document.getElementById('login-user').value || '').trim();
  });

  function sistemaVisible() {
    return !app.hidden && getComputedStyle(app).display !== 'none';
  }

  function mostrarBienvenida(nombre, destino) {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) {
      btn.classList.add('btn-ok');
      btn.textContent = '✔ Usuario correcto';
    }

    setTimeout(() => {
      document.getElementById('bienvenida-texto').textContent = `¡Bienvenido, ${nombre}!`;
      document.getElementById('bienvenida').classList.add('activa');
    }, 600);

    setTimeout(() => {
      window.location.href = destino; // o la función que uses para mostrar el dashboard
    }, 2800);
  }
}())