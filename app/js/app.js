import { crearBluetooth } from './ble.js';
import { iniciarAcuario } from './acuario.js';
import { CANALES, MANUAL, cmdColor, cmdHorario, guardarHorario, ponerHora, dentroDeHorario, encenderSiempre, pasosApagado, horasCompletas } from './protocolo.js';

export const VERSION = '0.9.36-beta'; // sube el último número en cada publicación; 1.0.0 = lista para la tienda
const $ = id => document.getElementById(id);
const COLORES_CSS = ['var(--rojo)', 'var(--verde)', 'var(--azul)', 'var(--uv)'];
const RAMPAS = [0, 30, 60, 90, 120, 150];
const ble = crearBluetooth();
let acuario = null; // módulo del acuario; se llena al cargar el catálogo

// ---- Estado guardado en el teléfono (comodidad: si se pierde, la lámpara sigue con su horario) ----
const PREDETERMINADO = {
  colores: [80, 70, 60, 30],
  activa: 'crecimiento',      // id de la mezcla elegida
  modificada: false,          // true si se movió un canal después de elegirla
  mias: [],                   // [{ id, nombre, canales }]
  horario: { encender: '10:00', apagar: '20:00', rampaMin: 60, colores: [80, 70, 60, 30] },
  guardadoEn: null,
};
let estado = cargar();
function cargar() {
  try { return { ...structuredClone(PREDETERMINADO), ...JSON.parse(localStorage.getItem('luz-acuario') || '{}') }; }
  catch { return structuredClone(PREDETERMINADO); }
}
function guardarLocal() { try { localStorage.setItem('luz-acuario', JSON.stringify(estado)); } catch { /* modo privado */ } }

// ---- Avisos ----
function avisar(texto, error = false) {
  const a = $('aviso'); a.textContent = texto; a.className = error ? 'error' : '';
  a.style.animation = 'none'; void a.offsetWidth; a.style.animation = ''; // con el celular acostado en el diseñador flota y se desvanece: reiniciar
}
function errorAmigable(e) {
  if (e?.name === 'NotFoundError') return 'No elegiste ninguna lámpara.';
  if (e?.name === 'NetworkError') return 'No pude conectar. Cierra la app Week Aqua (la lámpara acepta una sola conexión) y acércate a la lámpara.';
  if (e?.name === 'SecurityError' || e?.name === 'NotAllowedError') return 'Chrome no dio permiso de Bluetooth. Revisa los permisos de "Dispositivos cercanos" del navegador.';
  return e?.message || String(e);
}
async function enviar(lista, opciones, exito) {
  try { await ble.escribir(lista, opciones); if (exito) avisar(exito); return true; }
  catch (e) { avisar(errorAmigable(e), true); return false; }
}
/** Los botones de la lámpara siempre responden: si no hay conexión lo dicen en vez de quedarse "muertos". */
function requiereLampara() {
  if (ble.conectada()) return true;
  avisar('Primero conecta la lámpara: toca "Conectar" arriba.', true);
  $('chip').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 400, iterations: 2 });
  return false;
}
/** Muestra que el botón se tocó y está trabajando ("Apagando…") hasta que termina el envío. */
async function conBoton(boton, ocupado, tarea) {
  if (!requiereLampara() || boton.getAttribute('aria-busy')) return;
  const texto = boton.textContent;
  boton.textContent = ocupado; boton.setAttribute('aria-busy', 'true'); avisar(ocupado);
  try { await tarea(); }
  finally { boton.textContent = texto; boton.removeAttribute('aria-busy'); }
}

// Lo que se ve en el dibujo del acuario: lo último que se mandó a la lámpara.
let luzEnLampara = null;
function dibujarLampara(colores) { luzEnLampara = colores; acuario?.dibujar('ac-dibujo', colores); }

// ---- Conexión ----
ble.alCambiar(e => {
  const chip = $('chip'), t = chip.querySelector('span');
  chip.className = e.tipo === 'conectada' ? 'ok' : (e.tipo === 'conectando' || e.tipo === 'reconectando') ? 'esperando' : '';
  t.textContent = { conectada: 'Conectada', conectando: 'Conectando…', reconectando: `Reconectando (${e.intento}/3)…` }[e.tipo] || 'Conectar';
  // El paso "Enlaza tu lámpara" del registro muestra el mismo estado: si ya está conectada, se ve.
  const enl = $('enlazar');
  enl.textContent = { conectada: '✓ Lámpara enlazada', conectando: 'Conectando…', reconectando: 'Reconectando…' }[e.tipo] || 'Conectar lámpara';
  enl.classList.toggle('prim', e.tipo === 'conectada');
  if (e.tipo !== 'conectada') enManual = false;
  if (e.tipo === 'conectada') { avisar('Conectada. No se cambió nada en la lámpara.'); try { localStorage.setItem('lampara-enlazada', '1'); } catch { /* modo privado */ } }
  if (e.tipo === 'perdida') avisar('Se perdió la conexión. Acércate a la lámpara y toca "Conectar". Tu horario sigue funcionando: vive en la lámpara.', true);
  if (e.tipo === 'desconectada') avisar('Desconectada.');
});

// Primero la lámpara que Chrome ya recuerda; si no responde, el siguiente toque abre el selector
// (Chrome solo abre el selector justo después de un toque, por eso no se encadena).
let usarSelector = false;
$('chip').onclick = async () => {
  if (ble.conectada()) return ble.desconectar();
  if (!ble.disponible()) return avisar('Este navegador no tiene Bluetooth web. Ábrela en Chrome para Android.', true);
  const d = usarSelector ? null : await ble.recordada().catch(() => null);
  try {
    if (d) await ble.reconectar(d); else await ble.enlazar();
  } catch (e) {
    if (d) { usarSelector = true; return avisar('La lámpara recordada no respondió. Toca "Conectar" otra vez para elegirla de la lista.', true); }
    avisar(errorAmigable(e), true);
  }
};

// ---- Pestañas ----
const PESTANAS = [['t-acuario', 'tab-acuario'], ['t-ahora', 'tab-ahora'], ['t-horario', 'tab-horario'], ['t-bitacora', 'tab-bitacora']];
function mostrarPestana(tab) {
  PESTANAS.forEach(([t, p]) => { $(t).setAttribute('aria-selected', t === tab); $(p).hidden = t !== tab; });
  scrollTo(0, 0);
}
PESTANAS.forEach(([t]) => { $(t).onclick = () => mostrarPestana(t); });

// ---- Mezclas (listas + propias) ----
let mezclasBase = [], categoria = 'plantas';
const categorias = () => [...mezclasBase, { id: 'mias', nombre: 'Mías', mezclas: estado.mias }];
const buscarMezcla = id => categorias().flatMap(c => c.mezclas).find(m => m.id === id);
const esMia = id => estado.mias.some(m => m.id === id);

// ---- Pintar ----
const htmlBarras = c => c.map((p, i) => `<span style="height:${Math.max(p, 4)}%;background:${COLORES_CSS[i]}"></span>`).join('');
const escapar = s => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

function pintarAhora() {
  estado.colores.forEach((p, i) => { $(`r${i}`).value = p; $(`v${i}`).textContent = `${p} %`; });
  const potencia = Math.max(...estado.colores);
  $('potencia').value = potencia; $('v-potencia').textContent = `${potencia} %`;
  acuario?.dibujar('vista', estado.colores);

  const m = buscarMezcla(estado.activa);
  $('activa').textContent = m ? m.nombre + (estado.modificada ? ' · modificada' : '') : 'Personalizada';
  const mia = m && esMia(m.id);
  $('actualizar-mia').hidden = !(mia && estado.modificada);
  $('borrar-mia').hidden = !mia;

  $('categorias').innerHTML = categorias().map(c =>
    `<button type="button" class="chip" data-c="${c.id}" aria-pressed="${c.id === categoria}">${escapar(c.nombre)}</button>`).join('');
  const lista = categorias().find(c => c.id === categoria)?.mezclas || [];
  $('mezclas').innerHTML = lista.length ? lista.map(x => `
    <button type="button" class="mezcla num" data-m="${x.id}" aria-pressed="${x.id === estado.activa && !estado.modificada}">
      <b>${escapar(x.nombre)}</b><span class="barras">${htmlBarras(x.canales)}</span>
      <span class="sec">${x.canales.join(' · ')}</span>
    </button>`).join('')
    : '<p class="sec" style="grid-column: 1 / -1; margin: 0">Todavía no tienes mezclas propias. Ajusta los colores y toca "Guardar como mía".</p>';
}

// ---- Enviar colores en vivo: como mucho uno cada 150 ms, siempre con el último valor ----
let enManual = false, pendiente = false;
function alCambiarColores() {
  pintarAhora(); guardarLocal();
  if (!$('envivo').checked || !ble.conectada() || pendiente) return;
  pendiente = true;
  setTimeout(() => {
    pendiente = false;
    const previo = enManual ? [] : [MANUAL];
    enManual = true;
    dibujarLampara([...estado.colores]);
    enviar([...previo, cmdColor(estado.colores)], { pausa: 0 });
  }, 150);
}

// Canales
$('canales').innerHTML = CANALES.map((n, i) => `
  <div class="canal num" style="--c:${COLORES_CSS[i]}">
    <label for="r${i}"><span>${n}</span><span id="v${i}"></span></label>
    <input id="r${i}" type="range" min="0" max="100">
    <button class="paso" type="button" data-i="${i}" data-d="-1" aria-label="Bajar ${n} 1 %">−</button>
    <button class="paso" type="button" data-i="${i}" data-d="1" aria-label="Subir ${n} 1 %">+</button>
  </div>`).join('');
function cambiarCanal(i, valor) {
  estado.colores[i] = Math.min(100, Math.max(0, valor));
  estado.modificada = true;
  alCambiarColores();
}
CANALES.forEach((_, i) => $(`r${i}`).addEventListener('input', e => cambiarCanal(i, +e.target.value)));
$('canales').addEventListener('click', e => {
  const b = e.target.closest('.paso'); if (b) cambiarCanal(+b.dataset.i, estado.colores[+b.dataset.i] + +b.dataset.d);
});

// Potencia: escala los 4 canales manteniendo la proporción de la mezcla. No cuenta como "modificada".
let base = null; // mezcla al empezar a arrastrar, para no perder proporción al bajar y volver a subir
function aplicarPotencia(v) {
  const ref = base || estado.colores, max = Math.max(...ref);
  estado.colores = max ? ref.map(p => Math.round(p * v / max)) : ref.map(() => v);
  alCambiarColores();
}
$('potencia').addEventListener('input', e => { base ??= [...estado.colores]; aplicarPotencia(+e.target.value); });
$('potencia').addEventListener('change', () => { base = null; });
$('potencia-fila').addEventListener('click', e => {
  const b = e.target.closest('.paso'); if (!b) return;
  base = null; aplicarPotencia(Math.min(100, Math.max(0, Math.max(...estado.colores) + 5 * +b.dataset.d)));
});

// Elegir mezcla y categoría
$('categorias').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { categoria = b.dataset.c; pintarAhora(); } });
$('mezclas').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  const m = buscarMezcla(b.dataset.m);
  estado.colores = [...m.canales]; estado.activa = m.id; estado.modificada = false;
  alCambiarColores();
});

// Mezclas propias: guardar, actualizar, borrar
$('guardar-mia').onclick = () => { $('form-mia').hidden = false; $('nombre-mia').focus(); };
$('form-mia').addEventListener('submit', e => {
  e.preventDefault();
  const nombre = $('nombre-mia').value.trim(); if (!nombre) return;
  const nueva = { id: 'mia-' + Date.now(), nombre, canales: [...estado.colores] };
  estado.mias.push(nueva); estado.activa = nueva.id; estado.modificada = false; categoria = 'mias';
  $('form-mia').hidden = true; $('nombre-mia').value = '';
  guardarLocal(); pintarAhora(); avisar(`Guardada "${nombre}" en Mías.`);
});
$('actualizar-mia').onclick = () => {
  const m = estado.mias.find(x => x.id === estado.activa); if (!m) return;
  m.canales = [...estado.colores]; estado.modificada = false;
  guardarLocal(); pintarAhora(); avisar(`Cambios guardados en "${m.nombre}".`);
};
$('borrar-mia').onclick = () => {
  const m = estado.mias.find(x => x.id === estado.activa); if (!m) return;
  if (!confirm(`¿Borrar la mezcla "${m.nombre}"? No se puede deshacer.`)) return;
  estado.mias = estado.mias.filter(x => x.id !== m.id); estado.activa = null;
  guardarLocal(); pintarAhora(); avisar(`Borrada "${m.nombre}".`);
};

fetch('../datos/mezclas.json').then(r => r.json()).then(d => { mezclasBase = d.categorias; pintarAhora(); })
  .catch(() => avisar('No pude cargar las mezclas listas. Los controles y tus mezclas funcionan igual.', true));

// ---- Encender / apagar ----
const apagarSuave = e => conBoton(e.currentTarget, 'Apagando…', async () => {
  if (await enviar(pasosApagado(luzEnLampara || estado.colores), { pausa: 1500 }, 'Apagada. Tu horario la vuelve a encender a su hora.')) dibujarLampara([0, 0, 0, 0]);
});
const encenderAhora = e => conBoton(e.currentTarget, 'Encendiendo…', async () => {
  enManual = true;
  if (await enviar(encenderSiempre(estado.colores), {}, 'Encendida fuera de horario. Toca "Volver a mi horario" para regresar.')) dibujarLampara([...estado.colores]);
});
$('apagar').onclick = $('ac-apagar').onclick = apagarSuave;
$('encender').onclick = $('ac-encender').onclick = encenderAhora;
$('volver').onclick = e => conBoton(e.currentTarget, 'Volviendo…', async () => {
  const h = estado.horario;
  enManual = true;
  if (await enviar([MANUAL, cmdColor(h.colores), cmdHorario(h)], {}, `De vuelta a tu horario: ${h.encender} a ${h.apagar}.`)) {
    dibujarLampara(dentroDeHorario(h, horaActual()) ? [...h.colores] : [0, 0, 0, 0]);
  }
});

// ---- Horario ----
function pintarHorario() {
  const h = estado.horario;
  $('h-encender').value = h.encender; $('h-apagar').value = h.apagar;
  $('rampas').innerHTML = RAMPAS.map(m =>
    `<button type="button" class="chip" data-r="${m}" aria-pressed="${m === h.rampaMin}">${m === 0 ? 'Sin' : m < 60 ? `${m} m` : `${m / 60} h`}</button>`).join('');
  try {
    cmdHorario(h);
    const horas = horasCompletas(h);
    $('resumen').innerHTML = `<b>${horas.toLocaleString('es')} h</b> de luz completa` +
      (h.rampaMin ? `<div class="sec">Amanecer desde las ${h.encender} y atardecer hasta las ${h.apagar}, de ${h.rampaMin} min cada uno.</div>` : '');
    $('guardar').dataset.valido = '1';
  } catch (e) {
    $('resumen').innerHTML = `<span style="color:var(--error)">${escapar(e.message)}</span>`;
    $('guardar').dataset.valido = '';
  }
  $('barras-dia').innerHTML = htmlBarras(h.colores);
  $('color-dia').textContent = h.colores.join(' · ');
  $('guardado').textContent = estado.guardadoEn
    ? `Guardado en la lámpara el ${new Date(estado.guardadoEn).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}.`
    : 'Todavía no guardas un horario desde esta app.';
}
$('h-encender').addEventListener('change', e => { estado.horario.encender = e.target.value; guardarLocal(); pintarHorario(); });
$('h-apagar').addEventListener('change', e => { estado.horario.apagar = e.target.value; guardarLocal(); pintarHorario(); });
$('rampas').addEventListener('click', e => {
  const b = e.target.closest('[data-r]'); if (b) { estado.horario.rampaMin = +b.dataset.r; guardarLocal(); pintarHorario(); }
});
$('usar-ahora').onclick = () => { estado.horario.colores = [...estado.colores]; guardarLocal(); pintarHorario(); };
const horaActual = () => new Date().toTimeString().slice(0, 5);
$('guardar').onclick = e => {
  if (!$('guardar').dataset.valido) return avisar('Revisa las horas antes de guardar.', true);
  return conBoton(e.currentTarget, 'Guardando…', async () => {
    const h = estado.horario;
    // 1) Horario y color: si esto falla, no se guardó nada.
    if (!await enviar(guardarHorario(h, h.colores))) return;
    enManual = true;
    estado.guardadoEn = Date.now(); guardarLocal(); pintarHorario();
    acuario?.anotar(`Horario guardado en la lámpara: ${h.encender} a ${h.apagar}, rampa ${h.rampaMin} min, color ${h.colores.join('·')}`);
    const dentro = dentroDeHorario(h, horaActual());
    dibujarLampara(dentro ? [...h.colores] : [0, 0, 0, 0]);
    // 2) La hora va al final: la lámpara se reinicia unos segundos y el Bluetooth se reconecta solo.
    await ble.escribir(ponerHora()).catch(() => {});
    avisar(`Horario guardado: ${h.encender} a ${h.apagar}. ` + (dentro
      ? 'La lámpara puede apagarse unos segundos mientras toma la hora; es normal.'
      : `Ahora (${horaActual()}) está fuera de tu horario, así que la lámpara se queda apagada hasta las ${h.encender}. Usa "Encender" si la quieres prendida.`));
  });
};

// ---- Simular día: amanecer, día y atardecer acelerados con el color del día; luego vuelve al horario ----
let simulando = false;
$('simular').onclick = async () => {
  if (simulando) { simulando = false; return; }
  if (!requiereLampara()) return;
  simulando = true;
  $('simular').textContent = 'Detener'; $('sim-barra').hidden = false;
  const c = estado.horario.colores, PASO = 1500;
  // 0→100 % en 40 s, 100 % por 45 s, 100→0 % en 40 s, a oscuras 10 s
  const fases = [['Amanecer', 27, i => i / 26], ['Día', 30, () => 1], ['Atardecer', 27, i => 1 - i / 26], ['Noche', 7, () => 0]];
  const total = fases.reduce((s, f) => s + f[1], 0);
  let hecho = 0;
  try {
    await ble.escribir([MANUAL], { pausa: 0 }); enManual = true;
    for (const [nombre, pasos, nivel] of fases) {
      for (let i = 0; i < pasos && simulando; i++, hecho++) {
        const ahora = c.map(p => Math.round(p * nivel(i)));
        $('sim-estado').textContent = `${nombre} · ${Math.round(Math.max(...ahora))} %`;
        $('sim-avance').style.width = `${(hecho / total) * 100}%`;
        dibujarLampara(ahora); acuario?.dibujar('vista', ahora);
        await ble.escribir([cmdColor(ahora)], { pausa: PASO });
      }
    }
  } catch (err) { avisar(errorAmigable(err), true); }
  const fueDetenida = !simulando;
  simulando = false;
  $('simular').textContent = 'Simular'; $('sim-barra').hidden = true; $('sim-estado').textContent = '';
  pintarAhora();
  // Regresar al horario guardado para que la lámpara no se quede en el último paso.
  const h = estado.horario;
  if (ble.conectada() && await enviar([MANUAL, cmdColor(h.colores), cmdHorario(h)], {},
    fueDetenida ? 'Simulación detenida. La lámpara volvió a tu horario.' : 'Fin de la simulación. La lámpara volvió a tu horario.')) {
    dibujarLampara(dentroDeHorario(h, horaActual()) ? [...h.colores] : [0, 0, 0, 0]);
  }
};

// ---- Lo que el módulo del acuario puede pedir (siempre por un toque del usuario) ----
const aHora = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
function usarMezcla(canales) {
  estado.colores = [...canales]; estado.horario.colores = [...canales];
  estado.activa = null; estado.modificada = false;
  mostrarPestana('t-ahora'); alCambiarColores(); pintarHorario();
  avisar('Mezcla recomendada puesta en Luz y como color del día. Para dejarla fija, guárdala en Horario.');
}
function usarHoras(horas) {
  const h = estado.horario;
  const [hh, mm] = h.encender.split(':').map(Number);
  const fin = hh * 60 + mm + Math.round(horas * 60) + 2 * h.rampaMin;
  if (fin > 24 * 60) return avisar('Con esa hora de encender no caben las horas recomendadas antes de medianoche. Enciende más temprano.', true);
  h.apagar = aHora(fin); guardarLocal(); pintarHorario(); mostrarPestana('t-horario');
  avisar(`Apagar a las ${h.apagar}: ${horas.toLocaleString('es')} h de luz completa más amanecer y atardecer. Revisa y toca "Guardar en la lámpara".`);
}

// ---- Inicio ----
pintarAhora();
pintarHorario();
iniciarAcuario({ $, avisar, alUsarMezcla: usarMezcla, alUsarHoras: usarHoras, alConectar: () => ble.conectada() || $('chip').click(), mostrarPestana,
  obtenerColores: () => luzEnLampara || (dentroDeHorario(estado.horario, horaActual()) ? estado.horario.colores : [0, 0, 0, 0]) })
  .then(m => {
    acuario = m;
    pintarAhora();
    if (m.registrado()) { $('nav').hidden = false; mostrarPestana('t-acuario'); } else m.mostrarBienvenida();
  })
  .catch(() => { $('nav').hidden = false; mostrarPestana('t-ahora'); avisar('No pude cargar el catálogo del acuario. El control de la luz funciona igual.', true); });
if (!ble.disponible()) avisar('Este navegador no tiene Bluetooth web. Ábrela en Chrome para Android.', true);
// La versión nombra la caché del service worker: cada publicación (versión nueva) actualiza la app instalada.
$('version').textContent = `Versión ${VERSION.replace('-', ' ')}`;
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`sw.js?v=${VERSION}`).catch(() => {});

// Al recargar, Chrome corta el Bluetooth: si la lámpara ya fue autorizada antes, se reconecta sola (sin tocar "Conectar").
// shortcut: depende de getDevices(); si Chrome no lo tiene habilitado, hay que tocar "Conectar" como antes.
if (ble.disponible()) {
  if (ble.recuerda()) ble.recordada().then(d => d && ble.reconectar(d)).catch(() => {});
  else if (localStorage.getItem('lampara-enlazada')) // este Chrome no recuerda la lámpara: al menos decir qué hacer
    setTimeout(() => avisar('Al recargar, Chrome suelta la lámpara. Toca "Conectar" arriba y elígela de la lista.'), 1200);
}
