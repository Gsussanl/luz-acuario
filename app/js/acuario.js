// Módulo del acuario: registro, recomendación y bitácora. No sabe nada de Bluetooth;
// solo le pasa al módulo de luz "usa esta mezcla" o "usa estas horas" cuando el usuario lo pide.
import { recomendar, horasDeArranque, avisosDeGrupo } from '../../datos/recomendar.js';
import { PAISAJE, ARENA, seccionesPara, autocompletar, celdasAObjetos, nuevoId, posicionInicial, numerar, avisosDiseno, vistaFrontal, montados, plantilla, PLANTILLAS, vistaSuperior, listaCompras, esAlfombra, PERFILES } from './diseno.js';

const CLAVE = 'acuario';
const TIPOS = { co2: 'Plantado con CO₂', 'sin-co2': 'Plantado sin CO₂', peces: 'Solo peces' };
const BITACORA = [
  { id: 'agua', nombre: 'Cambio de agua', cada: 7 },
  { id: 'abono', nombre: 'Abono' },
  { id: 'poda', nombre: 'Poda', cada: 14 },
  { id: 'filtro', nombre: 'Filtro', cada: 30 },
  { id: 'parametros', nombre: 'Parámetros' },
  { id: 'nota', nombre: 'Nota' },
];
const DIA = 86400000;
const hoyISO = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local
const escapar = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

export async function iniciarAcuario({ $, avisar, alUsarMezcla, alUsarHoras, alConectar, mostrarPestana, obtenerColores }) {
  const [P, H] = await Promise.all([
    fetch('../datos/plantas.json').then(r => r.json()),
    fetch('../datos/habitantes.json').then(r => r.json()),
  ]);
  const plantas = P.plantas, habitantes = H.habitantes;
  let datos = cargar();

  function cargar() {
    try { return { acuario: null, plantas: [], habitantes: {}, bitacora: [], ...JSON.parse(localStorage.getItem(CLAVE) || '{}') }; }
    catch { return { acuario: null, plantas: [], habitantes: {}, bitacora: [] }; }
  }
  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* modo privado */ } }

  // ---------- Primer uso / editar ----------
  let borrador = null;
  function abrirRegistro(paso = 1) {
    borrador = structuredClone(datos);
    borrador.acuario ??= { nombre: 'Mi acuario', largo: 100, ancho: 35, alto: 45, tipo: 'co2', fecha: hoyISO() };
    const a = borrador.acuario;
    $('a-nombre').value = a.nombre; $('a-largo').value = a.largo; $('a-ancho').value = a.ancho; $('a-alto').value = a.alto;
    document.querySelector(`input[name=tipo][value="${a.tipo}"]`).checked = true;
    $('a-fecha').value = a.fecha === hoyISO() ? '' : a.fecha;
    $('a-montando').setAttribute('aria-pressed', a.fecha === hoyISO());
    pintarLitros(); pintarSeleccion();
    $('registro').hidden = false; $('nav').hidden = true; $('bienvenida').hidden = true;
    document.querySelectorAll('main > section[id^="tab-"]').forEach(s => { s.hidden = true; });
    irAPaso(paso);
  }
  function irAPaso(n) {
    [1, 2, 3].forEach(i => { $(`paso${i}`).hidden = i !== n; $(`pr${i}`).classList.toggle('hecho', i <= n); });
    scrollTo(0, 0);
  }
  function leerPaso1() {
    const a = borrador.acuario;
    a.nombre = $('a-nombre').value.trim() || 'Mi acuario';
    for (const k of ['largo', 'ancho', 'alto']) {
      const v = Math.round(+$(`a-${k}`).value);
      if (!(v >= 10 && v <= 400)) { avisar(`Revisa la medida "${k}": entre 10 y 400 cm.`, true); return false; }
      a[k] = v;
    }
    a.tipo = document.querySelector('input[name=tipo]:checked').value;
    a.fecha = $('a-fecha').value || hoyISO();
    return true;
  }
  const litros = a => Math.round(a.largo * a.ancho * a.alto / 1000);
  function pintarLitros() {
    const a = { largo: +$('a-largo').value || 0, ancho: +$('a-ancho').value || 0, alto: +$('a-alto').value || 0 };
    $('a-litros').textContent = `${litros(a)} L`;
  }
  ['a-largo', 'a-ancho', 'a-alto'].forEach(id => $(id).addEventListener('input', pintarLitros));
  $('comunes').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const [l, a, h] = b.dataset.m.split(','); $('a-largo').value = l; $('a-ancho').value = a; $('a-alto').value = h; pintarLitros();
  });
  $('a-montando').onclick = () => { $('a-fecha').value = ''; $('a-montando').setAttribute('aria-pressed', 'true'); };
  $('a-fecha').addEventListener('change', () => $('a-montando').setAttribute('aria-pressed', !$('a-fecha').value));

  function pintarSeleccion() {
    const filtro = $('buscar-planta').value.trim().toLowerCase();
    const elegida = p => borrador.plantas.includes(p.id);
    const visibles = plantas.filter(p => !filtro || (p.nombre + ' ' + p.cientifico).toLowerCase().includes(filtro))
      .sort((a, b) => elegida(b) - elegida(a));
    const pocas = Math.max(8, borrador.plantas.length), cortar = !filtro && !registroCompleto && visibles.length > pocas + 1;
    $('lista-plantas').innerHTML = (cortar ? visibles.slice(0, pocas) : visibles).map(p =>
      `<button type="button" class="chip planta" data-p="${p.id}" aria-pressed="${elegida(p)}">${escapar(p.nombre)}</button>`).join('')
      + (cortar ? `<button type="button" class="chip" data-todas>Ver todas (${visibles.length})…</button>` : '')
      || '<span class="sec">No hay plantas con ese nombre en el catálogo.</span>';
    $('n-plantas').textContent = `${borrador.plantas.length} elegidas`;
    $('lista-habitantes').innerHTML = habitantes.map(h => {
      const n = borrador.habitantes[h.id] || 0;
      return `<div><div style="flex:1"><div>${escapar(h.nombre)}</div><div class="sec">${h.tipo === 'pez' ? 'Pez' : h.tipo === 'camaron' ? 'Camarón' : 'Caracol'} · grupo de ${h.grupo}+</div></div>
        <button type="button" class="paso" data-h="${h.id}" data-d="-1" aria-label="Quitar un ${escapar(h.nombre)}" ${n ? '' : 'disabled'}>−</button>
        <span style="width: 26px; text-align: center; font-weight: 600">${n}</span>
        <button type="button" class="paso" data-h="${h.id}" data-d="1" aria-label="Agregar un ${escapar(h.nombre)}">+</button></div>`;
    }).join('');
  }
  $('buscar-planta').addEventListener('input', pintarSeleccion);
  let registroCompleto = false;
  $('lista-plantas').addEventListener('click', e => {
    if (e.target.closest('[data-todas]')) { registroCompleto = true; return pintarSeleccion(); }
    const b = e.target.closest('[data-p]'); if (!b) return;
    const id = b.dataset.p;
    borrador.plantas = borrador.plantas.includes(id) ? borrador.plantas.filter(x => x !== id) : [...borrador.plantas, id];
    pintarSeleccion();
  });
  $('lista-habitantes').addEventListener('click', e => {
    const b = e.target.closest('[data-h]'); if (!b) return;
    const n = Math.max(0, (borrador.habitantes[b.dataset.h] || 0) + +b.dataset.d);
    if (n) borrador.habitantes[b.dataset.h] = n; else delete borrador.habitantes[b.dataset.h];
    pintarSeleccion();
  });

  $('ir-paso2').onclick = () => { if (leerPaso1()) irAPaso(2); };
  $('volver-paso1').onclick = () => irAPaso(1);
  $('ir-paso3').onclick = () => irAPaso(3);
  $('volver-paso2').onclick = () => irAPaso(2);
  $('enlazar').onclick = alConectar;
  $('terminar').onclick = () => {
    const nuevo = !datos.acuario;
    datos = borrador;
    // Diseño inicial automático para que la vista no salga vacía; el usuario lo ajusta en el diseñador.
    if (nuevo || !diseno().objetos.length) diseno().objetos = automatico();
    guardar();
    $('registro').hidden = true; $('nav').hidden = false;
    pintarAcuario(); mostrarPestana('t-acuario');
    avisar(`Listo: ${datos.acuario.nombre} registrado. Toca el dibujo para acomodar tus plantas.`);
  };
  $('editar-acuario').onclick = () => abrirRegistro(1);

  // ---------- Pestaña Acuario ----------
  function seleccion() {
    return {
      selP: datos.plantas.map(id => plantas.find(p => p.id === id)).filter(Boolean),
      selH: Object.entries(datos.habitantes).map(([id, cantidad]) => ({ especie: habitantes.find(h => h.id === id), cantidad })).filter(x => x.especie),
    };
  }
  /** Vista frontal del diseño en el contenedor, con los colores que tiene la lámpara. */
  function dibujar(idContenedor, colores, seleccion) {
    $(idContenedor).innerHTML = vistaFrontal({ acuario: datos.acuario, diseno: diseno(), catalogo: plantas, colores, seleccion });
  }
  function automatico() {
    const n = seccionesPara(datos.acuario?.largo || 100);
    return celdasAObjetos(autocompletar(seleccion().selP, n), n, plantas, datos.acuario?.alto);
  }
  /** Diseño actual (objetos con posición libre). El diseño viejo por celdas se migra una vez y se guarda una copia. */
  function diseno() {
    if (datos.diseno?.celdas) {
      const viejo = datos.diseno;
      datos.diseno_v1 = viejo;
      datos.diseno = { version: 2, objetos: celdasAObjetos(viejo.celdas, viejo.secciones || seccionesPara(datos.acuario?.largo || 100), plantas, datos.acuario?.alto) };
      guardar();
    }
    datos.diseno ??= { version: 2, objetos: [] };
    datos.diseno.sustrato ??= { atras: 6, perfil: 'plano' }; // como se monta un plantado: más alto atrás
    return datos.diseno;
  }

  // ---------- Diseñador: tocar para elegir, arrastrar para mover ----------
  let sel = null;            // id del objeto principal elegido (sus valores se ven en la barra)
  let grupo = new Set();     // todos los elegidos (incluye sel); con "Elegir varios" se suman con cada toque
  let varios = false;
  const elegido = () => diseno().objetos.find(o => o.id === sel);
  const elegidos = () => diseno().objetos.filter(o => grupo.has(o.id));
  const elegir = id => { sel = id; grupo = new Set(id ? [id] : []); };
  const colorVista = () => obtenerColores().some(v => v) ? obtenerColores() : [70, 70, 60, 20];
  const nombreDe = o => o.planta ? plantas.find(p => p.id === o.planta)?.nombre : PAISAJE.find(x => x.id === o.paisaje)?.nombre;

  function abrirDisenador() {
    $('disenador').hidden = false; $('nav').hidden = true;
    document.querySelectorAll('main > section[id^="tab-"]').forEach(s => { s.hidden = true; });
    elegir(null); varios = false; pintarDisenador(); scrollTo(0, 0);
  }
  function pintarDisenador() {
    const { objetos } = diseno(), { selP } = seleccion(), numeros = numerar(objetos);
    const a = datos.acuario;
    grupo = new Set([...grupo].filter(id => objetos.some(o => o.id === id)));
    if (!grupo.has(sel)) sel = [...grupo][0] || null;
    $('di-medidas').textContent = `${a.largo} × ${a.alto} cm`;
    dibujar('di-vista', colorVista(), [...grupo]);
    $('di-arriba').innerHTML = vistaSuperior({ acuario: a, objetos, catalogo: plantas, seleccion: [...grupo] });
    const s = diseno().sustrato || {};
    $('di-pendiente').value = s.atras || 0; $('di-pendiente-v').textContent = `${s.atras || 0} cm`;
    $('di-perfiles').innerHTML = PERFILES.map(x => `<button type="button" class="chip planta" data-perfil="${x.id}" aria-pressed="${(s.perfil || 'plano') === x.id}">${x.nombre}</button>`).join('');
    pintarBarra();
    pintarPaleta();

    // Lista de compras: especies numeradas (como en la vista desde arriba) con cantidades aproximadas.
    const compras = listaCompras(objetos, plantas);
    $('di-leyenda').innerHTML = [
      ...compras.plantas.sort((x, y) => (numeros[plantas.find(p => p.nombre === x.nombre)?.id] || 99) - (numeros[plantas.find(p => p.nombre === y.nombre)?.id] || 99)).map(x => {
        const id = plantas.find(p => p.nombre === x.nombre)?.id;
        return `<div><b style="width: 22px">${numeros[id] || ''}.</b><span style="flex: 1">${escapar(x.nombre)}<br><span class="sec">${x.matas} mata${x.matas > 1 ? 's' : ''} en el diseño</span></span><b class="num">${x.cantidad} ${x.unidad}</b></div>`;
      }),
      ...compras.hardscape.map(x => `<div><b style="width: 22px">·</b><span style="flex: 1">${escapar(x.nombre)}<br><span class="sec">${x.detalle}</span></span><b class="num">${x.cantidad} ${x.unidad}</b></div>`),
    ].join('') || '<div class="sec">Aún no hay nada en el diseño.</div>';
    const avisos = avisosDiseno(objetos, plantas, a.alto);
    $('di-avisos').innerHTML = avisos.map(x => `<p>${escapar(x)}</p>`).join('');
    $('di-avisos').hidden = !avisos.length;
    // Cuántas imágenes faltan (se sabe cuando el navegador intenta cargarlas).
    setTimeout(() => {
      const faltan = [...new Set([...$('di-vista').querySelectorAll('.falta-img')].map(x => x.textContent).filter(Boolean))];
      $('di-faltan').textContent = faltan.length
        ? `Faltan ${faltan.length} ${faltan.length > 1 ? 'imágenes' : 'imagen'} (${faltan.join(', ')}). Guárdalas en app/img/plantas/ y app/img/paisaje/ con el nombre de PROMPTS-IMAGENES.md.`
        : '';
    }, 700);
  }
  let paletaCompleta = false;
  /** Agregar: sin buscar se ven unas pocas (tus plantas primero); el buscador recorre todo el catálogo, rocas y troncos. */
  function pintarPaleta() {
    const { selP } = seleccion();
    const f = $('di-buscar').value.trim().toLowerCase();
    const todo = [
      ...selP.map(p => ({ planta: p.id, texto: p.nombre, busca: p.nombre + ' ' + p.cientifico })),
      ...PAISAJE.map(x => ({ paisaje: x.id, texto: x.nombre, busca: x.nombre })),
      ...plantas.filter(p => !selP.includes(p)).map(p => ({ planta: p.id, texto: p.nombre, busca: p.nombre + ' ' + p.cientifico, otra: true })),
    ];
    const visibles = f ? todo.filter(x => x.busca.toLowerCase().includes(f)) : todo.filter(x => !x.otra);
    const POCAS = 6, cortar = !f && !paletaCompleta && visibles.length > POCAS + 1;
    const lista = cortar ? visibles.slice(0, POCAS) : visibles;
    $('di-paleta').innerHTML = lista.map(x =>
      `<button type="button" class="chip planta" data-agregar='${JSON.stringify({ planta: x.planta, paisaje: x.paisaje })}'>+ ${escapar(x.texto)}${x.otra ? ' <span class="sec">(no está en tu lista)</span>' : ''}</button>`).join('')
      + (cortar ? `<button type="button" class="chip" data-mas>Ver ${visibles.length - POCAS} más…</button>` : '')
      + (!f && paletaCompleta ? '<button type="button" class="chip" data-menos>Ver menos</button>' : '')
      || '<span class="sec">Nada con ese nombre. Prueba con otra palabra.</span>';
  }
  $('di-buscar').addEventListener('input', pintarPaleta);

  /** Barra de lo elegido: tamaño, voltear, duplicar, borrar. */
  function pintarBarra() {
    const o = elegido();
    $('di-sel').hidden = !o;
    $('di-ayuda').hidden = !!o;
    $('di-varios').setAttribute('aria-pressed', varios);
    $('di-varios').textContent = varios ? 'Elegir varios: sí' : 'Elegir varios';
    if (!o) return;
    $('di-sel-nombre').textContent = grupo.size > 1 ? `${grupo.size} elegidos` : nombreDe(o) || '';
    $('di-tamano').value = Math.round((o.escala || 1) * 100);
    $('di-tamano-v').textContent = `${Math.round((o.escala || 1) * 100)} %`;
    const p = plantas.find(z => z.id === o.planta);
    $('di-copias-fila').hidden = !p;
    if (p) { const n = o.copias || (esAlfombra(p) ? 3 : o.b < 82.5 && o.b >= ARENA[0] ? 4 : 3); $('di-copias').value = n; $('di-copias-v').textContent = n; }
    $('di-giro').value = o.rot || 0;
    $('di-giro-v').textContent = `${o.rot || 0}°`;
  }
  const cambiar = fn => { const lista = elegidos(); if (!lista.length) return; lista.forEach(fn); guardar(); pintarDisenador(); };

  $('di-paleta').addEventListener('click', e => {
    if (e.target.closest('[data-mas]')) { paletaCompleta = true; return pintarPaleta(); }
    if (e.target.closest('[data-menos]')) { paletaCompleta = false; return pintarPaleta(); }
    const b = e.target.closest('[data-agregar]'); if (!b) return;
    const item = JSON.parse(b.dataset.agregar);
    const { x, b: base } = posicionInicial(item, plantas);
    const objetos = diseno().objetos;
    const o = { id: nuevoId(), ...item, x: x + (objetos.length % 5) * 4 - 8, b: base, escala: 1, espejo: false,
      v: objetos.filter(z => z.paisaje && z.paisaje === item.paisaje).length };
    objetos.push(o); elegir(o.id); guardar(); pintarDisenador();
    $('di-vista').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    avisar(`${nombreDe(o)}: quedó al centro y marcada. Arrástrala a su lugar.`);
  });
  $('di-tamano').oninput = e => {
    if (!grupo.size) return;
    for (const o of elegidos()) o.escala = +e.target.value / 100;
    $('di-tamano-v').textContent = `${e.target.value} %`;
    dibujar('di-vista', colorVista(), [...grupo]);
  };
  $('di-tamano').onchange = () => { guardar(); pintarDisenador(); };
  $('di-giro').oninput = e => {
    if (!grupo.size) return;
    for (const o of elegidos()) o.rot = +e.target.value;
    $('di-giro-v').textContent = `${e.target.value}°`;
    dibujar('di-vista', colorVista(), [...grupo]);
  };
  $('di-giro').onchange = () => { guardar(); pintarDisenador(); };
  $('di-copias').oninput = e => {
    if (!grupo.size) return;
    for (const o of elegidos()) if (o.planta) o.copias = +e.target.value;
    $('di-copias-v').textContent = e.target.value;
    dibujar('di-vista', colorVista(), [...grupo]);
  };
  $('di-copias').onchange = () => { guardar(); pintarDisenador(); };
  $('di-voltear').onclick = () => cambiar(o => { o.espejo = !o.espejo; });
  $('di-frente').onclick = () => cambiar(o => { o.orden = (o.orden || 0) + 1; });
  $('di-atras').onclick = () => cambiar(o => { o.orden = (o.orden || 0) - 1; });
  $('di-duplicar').onclick = () => {
    const copias = elegidos().map(o => ({ ...o, id: nuevoId(), x: Math.min(98, o.x + 8), v: (o.v || 0) + 1 }));
    if (!copias.length) return;
    diseno().objetos.push(...copias);
    sel = copias[0].id; grupo = new Set(copias.map(o => o.id)); guardar(); pintarDisenador();
  };
  $('di-borrar').onclick = () => {
    if (!grupo.size) return;
    diseno().objetos = diseno().objetos.filter(z => !grupo.has(z.id)); elegir(null); guardar(); pintarDisenador();
  };
  $('di-soltar').onclick = () => { elegir(null); varios = false; pintarDisenador(); };
  $('di-varios').onclick = () => { varios = !varios; pintarBarra(); avisar(varios ? 'Toca cada cosa que quieras sumar o quitar del grupo. Arrastra una y se mueven todas.' : 'Elegir varios: apagado.'); };
  $('di-especie').onclick = () => { // todas las matas de la misma especie (o rocas del mismo tipo)
    const o = elegido(); if (!o) return;
    grupo = new Set(diseno().objetos.filter(z => o.planta ? z.planta === o.planta : z.paisaje === o.paisaje).map(z => z.id));
    pintarDisenador();
  };
  // Vista desde arriba: tocar una mancha la elige (y en el frente queda marcada).
  $('di-arriba').addEventListener('click', e => {
    const el = e.target.closest('[data-o]'); if (!el) return;
    const id = el.dataset.o;
    if (varios) { grupo.has(id) ? grupo.delete(id) : grupo.add(id); sel = grupo.has(id) ? id : [...grupo][0] || null; }
    else elegir(id);
    pintarDisenador();
  });

  // Arrastrar: mientras el dedo se mueve solo se desplazan las imágenes (fluido); al soltar se guarda y se redibuja.
  let arrastre = null;
  // Las imágenes tienen zonas transparentes: solo cuenta el toque donde de verdad hay planta/roca (si no, la alfombra "atrapa" todo).
  const alfas = new Map();
  function opaco(img, x, y) {
    if (!img.naturalWidth) return true;
    let m = alfas.get(img.src);
    if (!m) {
      const k = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, c.width, c.height);
      m = { ctx, w: c.width, h: c.height }; alfas.set(img.src, m);
    }
    // Caja sin giro (offset*: no la cambian las transformaciones); object-fit: contain, apoyada abajo y centrada.
    const c = img.offsetParent.getBoundingClientRect();
    const r = { left: c.left + img.offsetLeft, top: c.top + img.offsetTop, width: img.offsetWidth, height: img.offsetHeight };
    const rot = (parseFloat(img.style.rotate) || 0) * Math.PI / 180;
    if (rot) { // deshacer el giro alrededor del centro de la base
      const px = r.left + r.width / 2, py = r.top + r.height, dx = x - px, dy = y - py;
      x = px + dx * Math.cos(-rot) - dy * Math.sin(-rot); y = py + dx * Math.sin(-rot) + dy * Math.cos(-rot);
    }
    const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s, izq = r.left + (r.width - w) / 2, arriba = r.top + r.height - h;
    let u = (x - izq) / w; const v = (y - arriba) / h;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    if (img.style.transform.includes('scaleX(-1)')) u = 1 - u;
    return m.ctx.getImageData(Math.min(m.w - 1, u * m.w | 0), Math.min(m.h - 1, v * m.h | 0), 1, 1).data[3] > 40;
  }
  $('di-vista').addEventListener('pointerdown', e => {
    const el = document.elementsFromPoint(e.clientX, e.clientY)
      .find(x => x.dataset?.o && $('di-vista').contains(x) && (x.tagName !== 'IMG' || opaco(x, e.clientX, e.clientY)));
    if (!el) { if (grupo.size && !varios) { elegir(null); pintarDisenador(); } return; }
    const id = el.dataset.o;
    if (varios) {
      if (grupo.has(id) && grupo.size > 1) { grupo.delete(id); sel = [...grupo][0]; pintarDisenador(); return; } // tocar de nuevo = quitar
      grupo.add(id); sel = id;
    } else if (!grupo.has(id)) elegir(id);
    else sel = id;
    dibujar('di-vista', colorVista(), [...grupo]); pintarBarra();
    $('di-arriba').innerHTML = vistaSuperior({ acuario: datos.acuario, objetos: diseno().objetos, catalogo: plantas, seleccion: [...grupo] });
    const caja = $('di-vista').querySelector('.vista-frontal').getBoundingClientRect();
    const objs = diseno().objetos;
    const ids = [...new Set(elegidos().flatMap(o => [o.id, ...(o.paisaje ? montados(objs, o, datos.acuario) : [])]))];
    arrastre = { ids, x0: e.clientX, y0: e.clientY, caja, movio: false,
      piezas: ids.flatMap(k => [...$('di-vista').querySelectorAll(`[data-o="${k}"]`)]) };
    $('di-vista').setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  $('di-vista').addEventListener('pointermove', e => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x0, dy = e.clientY - arrastre.y0;
    if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movio = true;
    for (const p of arrastre.piezas) p.style.translate = `${dx}px ${dy}px`;
  });
  const soltar = e => {
    if (!arrastre) return;
    const { ids, x0, y0, caja, movio } = arrastre; arrastre = null;
    if (!movio) return;
    const dx = (e.clientX - x0) / caja.width * 100, db = (e.clientY - y0) / caja.height * 100;
    for (const o of diseno().objetos.filter(z => ids.includes(z.id))) {
      o.x = Math.min(100, Math.max(0, o.x + dx));
      o.b = Math.min(ARENA[1] + 2, Math.max(15, o.b + db));
    }
    guardar(); pintarDisenador();
  };
  $('di-vista').addEventListener('pointerup', soltar);
  $('di-vista').addEventListener('pointercancel', soltar);

  // Sustrato: más alto atrás (cm) y forma a lo largo; las plantas y rocas se apoyan en la nueva altura.
  $('di-pendiente').oninput = e => {
    diseno().sustrato = { ...diseno().sustrato, atras: +e.target.value };
    $('di-pendiente-v').textContent = `${e.target.value} cm`;
    dibujar('di-vista', colorVista(), [...grupo]);
  };
  $('di-pendiente').onchange = () => { guardar(); pintarDisenador(); };
  $('di-perfiles').addEventListener('click', e => {
    const b = e.target.closest('[data-perfil]'); if (!b) return;
    const s = diseno().sustrato || {};
    diseno().sustrato = { ...s, perfil: b.dataset.perfil, atras: s.atras || 6 }; // si estaba parejo, darle una pendiente visible
    guardar(); pintarDisenador();
  });
  $('di-plantillas').innerHTML = PLANTILLAS.map(x =>
    `<button type="button" class="chip planta" data-plantilla="${x.id}" title="${escapar(x.nota)}">${escapar(x.nombre)}</button>`).join('');
  $('di-plantillas').addEventListener('click', e => {
    const b = e.target.closest('[data-plantilla]'); if (!b) return;
    const d = diseno(), x = PLANTILLAS.find(z => z.id === b.dataset.plantilla);
    if (d.objetos.length && !confirm(`¿Reemplazar tu diseño por el estilo ${x.nombre}? (${x.nota})`)) return;
    d.objetos = plantilla(x.id, seleccion().selP, datos.acuario); elegir(null); guardar(); pintarDisenador();
    avisar(`Estilo ${x.nombre} aplicado con tus plantas. Muévelo a tu gusto.`);
  });
  $('di-auto').onclick = () => {
    const d = diseno();
    if (d.objetos.length && !confirm('¿Reemplazar tu diseño por uno automático según la zona de cada planta?')) return;
    d.objetos = automatico(); elegir(null); guardar(); pintarDisenador();
  };
  $('di-vaciar').onclick = () => {
    if (!confirm('¿Vaciar todo el diseño?')) return;
    diseno().objetos = []; elegir(null); guardar(); pintarDisenador();
  };
  $('di-listo').onclick = () => {
    $('disenador').hidden = true; $('nav').hidden = false; elegir(null);
    pintarAcuario(); mostrarPestana('t-acuario');
  };
  $('di-copiar').onclick = async () => {
    const c = listaCompras(diseno().objetos, plantas), a = datos.acuario;
    const texto = [`Lista para ${a.nombre} (${a.largo}×${a.ancho}×${a.alto} cm) · cantidades aproximadas`,
      ...c.plantas.map(x => `- ${x.nombre}: ${x.cantidad} ${x.unidad}`),
      ...c.hardscape.map(x => `- ${x.nombre}: ${x.cantidad} ${x.unidad} ${x.detalle}`)].join('\n');
    try { await navigator.clipboard.writeText(texto); avisar('Lista copiada: pégala en WhatsApp o en tus notas.'); }
    catch { prompt('Copia la lista:', texto); }
  };
  $('di-imagen').onclick = async () => {
    try {
      dibujar('di-vista', colorVista()); // sin el brillo de selección
      const blob = await imagenDeVista($('di-vista').querySelector('.vista-frontal'));
      pintarDisenador();
      const archivo = new File([blob], `${(datos.acuario.nombre || 'acuario').replace(/[^\w-]+/g, '-')}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: datos.acuario.nombre });
      else { const u = URL.createObjectURL(blob); Object.assign(document.createElement('a'), { href: u, download: archivo.name }).click(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
    } catch (e) { pintarDisenador(); if (e.name !== 'AbortError') avisar('No pude crear la imagen: ' + e.message, true); }
  };
  $('disenar').onclick = abrirDisenador;
  // Tocar el dibujo también abre el diseñador (en Acuario y en Luz): es lo primero que uno intenta.
  for (const id of ['ac-dibujo', 'vista']) { $(id).onclick = abrirDisenador; $(id).style.cursor = 'pointer'; $(id).title = 'Toca para editar el diseño'; }

  function mostrarBienvenida() {
    $('bienvenida').hidden = false; $('nav').hidden = true;
    document.querySelectorAll('main > section[id^="tab-"]').forEach(s => { s.hidden = true; });
  }
  $('empezar').onclick = () => abrirRegistro(1);
  function pintarAcuario() {
    const a = datos.acuario; if (!a) return;
    $('titulo').textContent = a.nombre;
    $('ac-nombre').textContent = a.nombre;
    $('ac-medidas').textContent = `${a.largo} × ${a.ancho} × ${a.alto} cm · ${litros(a)} L · ${TIPOS[a.tipo]}`;
    const dias = Math.floor((new Date(hoyISO()) - new Date(a.fecha)) / DIA);
    $('ac-montaje').textContent = dias <= 0 ? 'Montado hoy · semana 1 de arranque'
      : `Montado hace ${dias} días · semana ${Math.floor(dias / 7) + 1}`;

    const { selP, selH } = seleccion();
    dibujar('ac-dibujo', obtenerColores());
    $('ac-plantas').innerHTML = selP.map(p => `<span class="chip planta" aria-pressed="true" style="display:inline-flex;align-items:center">${escapar(p.nombre)}</span>`).join('')
      || '<span class="sec">Sin plantas registradas.</span>';
    $('ac-habitantes').textContent = selH.map(x => `${x.cantidad} ${x.especie.nombre}`).join(' · ') || 'Ninguno registrado.';

    const r = selP.length ? recomendar(selP, selH.map(x => x.especie), { co2: a.tipo === 'co2', nuevo: false }) : null;
    const objetivo = r ? r.luz.horas : 7;
    const horasHoy = horasDeArranque(objetivo, Math.max(0, dias));
    const canales = r ? [r.luz.canales.rojo, r.luz.canales.verde, r.luz.canales.azul, r.luz.canales.uv] : [60, 60, 60, 20];
    const avisos = [...(r?.avisos || []), ...avisosDeGrupo(selH)];
    const semanasFaltan = Math.ceil((objetivo - horasHoy) / 0.5);

    const abierto = $('ac-detalles')?.open ?? false;
    $('ac-recomendacion').innerHTML = `
      <details id="ac-detalles" class="tarjeta" ${abierto ? 'open' : ''}>
      <summary style="cursor: pointer; list-style-position: outside"><b>Recomendaciones</b>
        <span class="sec num"> · Luz ${r ? r.luz.nivel.toLowerCase() : 'para ver'}, ${horasHoy.toLocaleString('es')} h${r?.co2 ? ` · CO₂ ${r.co2.objetivo}` : ''}${avisos.length ? ` · ${avisos.length} aviso${avisos.length > 1 ? 's' : ''}` : ''}</span></summary>
      <div class="pila" style="gap: 12px; margin-top: 12px">
      <div class="pila" style="gap: 10px">
        <h2>Luz recomendada</h2>
        <div class="datos num">
          <div><span>Nivel</span><b>${r ? r.luz.nivel : 'Para ver'}</b></div>
          <div><span>Hoy</span><b>${horasHoy.toLocaleString('es')} h</b></div>
          <div><span>Mezcla</span><b style="font-size: 13px; line-height: 1.6">${canales.join('·')}</b></div>
        </div>
        <span class="sec">${horasHoy < objetivo ? `Arranque: subirá 30 min por semana hasta ${objetivo} h (en ${semanasFaltan} semanas).` : `Horas de luz completa al día: ${objetivo} h.`}${r ? '' : ' Sin plantas, la luz es para ver.'}</span>
        <div class="fila">
          <button type="button" class="btn" id="usar-mezcla">Usar esta mezcla</button>
          <button type="button" class="btn prim" id="usar-horas">Usar ${horasHoy.toLocaleString('es')} h en mi horario</button>
        </div>
      </div>
      ${r?.co2 ? `<div class="pila" style="gap: 6px; border-top: 1px solid var(--linea); padding-top: 12px"><h2>CO₂ · ${r.co2.objetivo}</h2>
        <span class="sec">Prender ${r.co2.inicio}; apagar ${r.co2.fin}. ${r.co2.control}.</span></div>` : ''}
      ${r ? `<div class="pila" style="gap: 6px; border-top: 1px solid var(--linea); padding-top: 12px"><h2>Abonado</h2>
        <span class="sec">${[r.abonado.metodo, `Cambio de agua: ${r.abonado.cambioAgua}`, r.abonado.pastillas, r.abonado.extra].filter(Boolean).map(escapar).join('<br>')}</span></div>` : ''}
      ${avisos.length ? `<div class="nota-aviso" role="note">${avisos.map(x => `<p>${escapar(x)}</p>`).join('')}</div>` : ''}
      <p class="sec" style="margin: 0">Valores de partida de la comunidad, no una receta. Ajusta según cómo respondan tus plantas.</p>
      </div></details>`;
    $('usar-mezcla').onclick = () => alUsarMezcla(canales);
    $('usar-horas').onclick = () => alUsarHoras(horasHoy);
  }

  // ---------- Bitácora ----------
  $('bi-tipos').innerHTML = BITACORA.map(t => `<button type="button" class="mezcla" data-t="${t.id}" style="align-items:center;text-align:center;min-height:56px;justify-content:center"><b>${t.nombre}</b></button>`).join('');
  $('bi-tipos').addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const tipo = BITACORA.find(t => t.id === b.dataset.t);
    datos.bitacora.unshift({ id: Date.now(), tipo: tipo.id, fecha: Date.now(), detalle: $('bi-detalle').value.trim() });
    $('bi-detalle').value = ''; guardar(); pintarBitacora();
    avisar(`Anotado: ${tipo.nombre}.`);
  });
  $('bi-historial').addEventListener('click', e => {
    const b = e.target.closest('[data-borrar]'); if (!b) return;
    if (!confirm('¿Borrar esta anotación?')) return;
    datos.bitacora = datos.bitacora.filter(x => x.id !== +b.dataset.borrar); guardar(); pintarBitacora();
  });
  function pintarBitacora() {
    const fmt = f => new Date(f).toLocaleDateString('es', { day: 'numeric', month: 'short' });
    $('bi-resumen').innerHTML = BITACORA.filter(t => t.cada).map(t => {
      const ultimo = datos.bitacora.find(x => x.tipo === t.id);
      const dias = ultimo ? Math.floor((Date.now() - ultimo.fecha) / DIA) : null;
      const estado = dias === null ? '<span class="sec">sin registro</span>'
        : dias >= t.cada ? `<b style="color: var(--sol)">toca hoy</b> <span class="sec">(hace ${dias} días)</span>`
        : `<span class="sec">hace ${dias} días · cada ${t.cada}</span>`;
      return `<div style="display:flex;justify-content:space-between;padding:4px 0"><span>${t.nombre}</span><span>${estado}</span></div>`;
    }).join('');
    $('bi-historial').innerHTML = datos.bitacora.slice(0, 50).map(x => {
      const t = BITACORA.find(b => b.id === x.tipo);
      return `<div><div style="flex:1"><div>${t ? t.nombre : x.tipo}</div>${x.detalle ? `<div class="sec">${escapar(x.detalle)}</div>` : ''}</div>
        <span class="sec">${fmt(x.fecha)}</span>
        <button type="button" class="chip" data-borrar="${x.id}" aria-label="Borrar anotación">Borrar</button></div>`;
    }).join('') || '<div class="sec">Todavía no hay anotaciones.</div>';
  }

  // Datos guardados por la versión anterior (sin diseño): arrancar con el automático.
  if (datos.acuario && !datos.diseno) { diseno().objetos = automatico(); guardar(); }
  pintarAcuario(); pintarBitacora();
  return { registrado: () => !!datos.acuario, abrirRegistro, mostrarBienvenida, dibujar, anotar: texto => { datos.bitacora.unshift({ id: Date.now(), tipo: 'nota', fecha: Date.now(), detalle: texto }); guardar(); pintarBitacora(); } };
}

/**
 * Dibuja la vista frontal (ya armada en el DOM) en un PNG: fondo, arena, sombras e imágenes en su orden de capas,
 * con giro y volteo, y al final la luz de la lámpara. Lo que falta (marcadores) no se dibuja.
 */
async function imagenDeVista(vista) {
  const k = 2, W = vista.clientWidth, H = vista.clientHeight;
  const c = Object.assign(document.createElement('canvas'), { width: W * k, height: H * k });
  const ctx = c.getContext('2d'); ctx.scale(k, k);
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16262C'); g.addColorStop(1, '#0D1A1F');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const arena = vista.querySelector('.sustrato'), za = +getComputedStyle(arena).zIndex;
  const piezas = [...vista.querySelectorAll('img[data-o], .sombra')].map((el, i) => ({ el, i, z: +getComputedStyle(el).zIndex || 0 }));
  piezas.push({ arena: true, z: za, i: -1 });
  piezas.sort((a, b) => a.z - b.z || a.i - b.i);
  await Promise.all(piezas.filter(p => p.el?.tagName === 'IMG').map(p => p.el.decode().catch(() => {})));
  for (const p of piezas) {
    if (p.arena) {
      const borde = (arena.dataset.borde || '0 78.5,100 78.5').split(',').map(p => p.split(' ').map(Number));
      const top = Math.min(...borde.map(p => p[1])) / 100 * H;
      g = ctx.createLinearGradient(0, top, 0, H); g.addColorStop(0, '#2A2018'); g.addColorStop(0.35, '#3A2C20'); g.addColorStop(1, '#241A12');
      ctx.fillStyle = g; ctx.beginPath(); borde.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x / 100 * W, y / 100 * H));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); continue;
    }
    const el = p.el, x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
    if (el.classList.contains('sombra')) {
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(w / 2, h / 2);
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore(); continue;
    }
    if (!el.naturalWidth) continue;
    const s = Math.min(w / el.naturalWidth, h / el.naturalHeight), dw = el.naturalWidth * s, dh = el.naturalHeight * s;
    ctx.save();
    ctx.translate(x + w / 2, y + h);                                   // base de la imagen
    ctx.rotate((parseFloat(el.style.rotate) || 0) * Math.PI / 180);
    if (el.style.transform.includes('scaleX(-1)')) ctx.scale(-1, 1);
    ctx.drawImage(el, -dw / 2, -dh, dw, dh);
    ctx.restore();
  }
  // Luz de la lámpara (color en modo luz suave) y brillo general, como en pantalla.
  const luz = vista.querySelector('.luz');
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = +luz.style.opacity || 0.3;
  ctx.fillStyle = luz.style.background; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const brillo = (vista.style.filter.match(/brightness\(([\d.]+)\)/) || [])[1];
  const final = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height });
  const f = final.getContext('2d'); if (brillo) f.filter = `brightness(${brillo})`; f.drawImage(c, 0, 0);
  return new Promise((ok, mal) => final.toBlob(b => b ? ok(b) : mal(new Error('sin imagen')), 'image/png'));
}
