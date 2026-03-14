// Validación visual en tiempo real
const nuevaInput = document.getElementById('nuevaPassword');

nuevaInput.addEventListener('input', () => {
  const val = nuevaInput.value;

  const largo = val.length >= 8;
  const mayus = /[A-Z]/.test(val);
  const num   = /[0-9]/.test(val);

  setReq('req-largo', largo, 'Mínimo 8 caracteres');
  setReq('req-mayus', mayus, 'Al menos una mayúscula');
  setReq('req-num',   num,   'Al menos un número');
});

function setReq(id, ok, texto) {
  const el = document.getElementById(id);
  el.textContent = (ok ? '✓ ' : '✗ ') + texto;
  el.className = ok ? 'ok' : 'fail';
}