// Módulo del acuario: registro, recomendación y bitácora. No sabe nada de Bluetooth;
// solo le pasa al módulo de luz "usa esta mezcla" o "usa estas horas" cuando el usuario lo pide.
import { recomendar, horasDeArranque, avisosDeGrupo } from '../../datos/recomendar.js';
import { PAISAJE, seccionesPara, autocompletar, celdasAObjetos, nuevoId, posicionInicial, numerar, avisosDiseno, vistaFrontal, plantilla, PLANTILLAS, vistaSuperior, listaCompras, esAlfombra, PERFILES, archivoPaisaje, SUSTRATOS, tipoSustrato, sustratoAComprar, granos, TEXTURA_CM, aplicarMatriz, OLAS,
  aV3, mallaDesde, suavizar, consejosComposicion, gruposAgregar, resumenCompras, apoyo, sobreDesdePunto, dibujarObjeto, soporteDe, bDe, profundidad, planoDe, MALLA, ALTO_MIN, ALTO_AVISO, altoMax, sustratoMasAlto } from './diseno.js';

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
    document.querySelector(`input[name=sustrato][value="${tipoSustrato(a)}"]`).checked = true;
    sustratoElegido = !!a.sustrato;
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
    a.sustrato = document.querySelector('input[name=sustrato]:checked').value;
    a.fecha = $('a-fecha').value || hoyISO();
    return true;
  }
  // Sustrato: sigue al tipo de acuario (aquasoil en plantados, gravilla en "solo peces") hasta que la persona elija uno.
  let sustratoElegido = false;
  document.querySelectorAll('input[name=tipo]').forEach(r => r.addEventListener('change', () => {
    if (!sustratoElegido) document.querySelector(`input[name=sustrato][value="${tipoSustrato({ tipo: r.value })}"]`).checked = true;
  }));
  document.querySelectorAll('input[name=sustrato]').forEach(r => r.addEventListener('change', () => { sustratoElegido = true; }));
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
    $(idContenedor).innerHTML = vistaFrontal({ acuario: datos.acuario, diseno: diseno(), catalogo: plantas, colores, seleccion, candados: idContenedor === 'di-vista' });
  }
  function automatico() {
    const n = seccionesPara(datos.acuario?.largo || 100);
    return celdasAObjetos(autocompletar(seleccion().selP, n), n, plantas, datos.acuario?.alto, datos.acuario?.largo);
  }
  /**
   * Diseño actual (objetos con posición libre). Los diseños viejos se convierten una vez y se guarda una copia:
   * por celdas (diseno_v1) y versión 2 (diseno_v2: otra escala de profundidad y plantas "encima" sin unir).
   */
  function diseno() {
    const medidas = { largo: datos.acuario?.largo || 100, alto: datos.acuario?.alto || 45 };
    if (datos.diseno?.celdas) {
      const viejo = datos.diseno;
      datos.diseno_v1 = viejo;
      datos.diseno = { version: 3, objetos: celdasAObjetos(viejo.celdas, viejo.secciones || seccionesPara(medidas.largo), plantas, medidas.alto, medidas.largo) };
      guardar();
    }
    datos.diseno ??= { version: 3, objetos: [] };
    if ((datos.diseno.version || 2) < 3) {
      datos.diseno_v2 = structuredClone(datos.diseno);
      datos.diseno.objetos = aV3(datos.diseno.objetos || [], medidas);
      datos.diseno.version = 3;
      guardar();
    }
    const s = datos.diseno.sustrato ??= { atras: 6, perfil: 'plano' }; // como se monta un plantado: más alto atrás
    s.frente ??= 3; // al frente, mínimo 3 cm
    s.malla ??= mallaDesde(s, medidas.alto);
    return datos.diseno;
  }

  // ---------- Diseñador: tocar para elegir, arrastrar para mover ----------
  let sel = null;            // id del objeto principal elegido (sus valores se ven en la barra)
  let grupo = new Set();     // todos los elegidos (incluye sel); con "Elegir varios" se suman con cada toque
  let varios = false;
  const elegido = () => diseno().objetos.find(o => o.id === sel);
  const elegidos = () => diseno().objetos.filter(o => grupo.has(o.id));
  // Celular acostado (no tablet): el diseñador va a pantalla completa (ver el CSS y pintarAcostado).
  const acostado = matchMedia('(orientation: landscape) and (max-height: 500px)');
  const instalada = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
  let ultimoSel = null;      // para subir el panel flotante al elegir algo nuevo
  let uniendo = false;       // "Unir a roca o tronco": esperando que se toque la roca o tronco
  const elegir = id => { sel = id; grupo = new Set(id ? [id] : []); uniendo = false; };
  const colorVista = () => obtenerColores().some(v => v) ? obtenerColores() : [70, 70, 60, 20];
  const nombreDe = o => o.planta ? plantas.find(p => p.id === o.planta)?.nombre : PAISAJE.find(x => x.id === o.paisaje)?.nombre;

  function abrirDisenador() {
    $('disenador').hidden = false; $('nav').hidden = true;
    document.querySelectorAll('main > section[id^="tab-"]').forEach(s => { s.hidden = true; });
    elegir(null); varios = false; editandoMalla = false; puntos = new Set(); $('di-vista').classList.remove('tercios'); pintarDisenador(); ponerZoom(1); scrollTo(0, 0);
  }
  function pintarDisenador() {
    const { objetos } = diseno(), { selP } = seleccion(), numeros = numerar(objetos);
    const a = datos.acuario;
    grupo = new Set([...grupo].filter(id => objetos.some(o => o.id === id)));
    if (!grupo.has(sel)) sel = [...grupo][0] || null;
    $('di-medidas').textContent = `${a.largo} × ${a.alto} cm`;
    $('di-zoom-caja').style.setProperty('--prop', (a.alto / a.largo * 1.09).toFixed(3)); // alto/ancho del dibujo (acostado)
    dibujar('di-vista', colorVista(), [...grupo]);
    pintarArriba();
    pintarAtajos(); pintarMalla(); pintarBloqueados();
    const tipo = tipoSustrato(a);
    $('di-sustratos').innerHTML = Object.entries(SUSTRATOS).map(([id, x]) => `<button type="button" class="chip planta" data-sustrato="${id}" aria-pressed="${tipo === id}">${x.nombre}</button>`).join('');
    pintarBarra();
    pintarPaleta();
    $('di-profundidad').setAttribute('aria-pressed', diseno().profundidad !== false);
    $('di-profundidad').textContent = diseno().profundidad !== false ? 'Profundidad: lo de atrás más oscuro' : 'Profundidad: apagada';
    if (acostado.matches && sel && sel !== ultimoSel) $('di-panel').scrollTop = 0; // al elegir algo, sus controles arriba del panel flotante
    ultimoSel = sel;

    // Lista de compras: especies numeradas (como en la vista desde arriba) con cantidades aproximadas.
    const compras = listaCompras(objetos, plantas);
    $('di-leyenda').innerHTML = [
      ...compras.plantas.sort((x, y) => (numeros[plantas.find(p => p.nombre === x.nombre)?.id] || 99) - (numeros[plantas.find(p => p.nombre === y.nombre)?.id] || 99)).map(x => {
        const id = plantas.find(p => p.nombre === x.nombre)?.id;
        return `<div><b style="width: 22px">${numeros[id] || ''}.</b><span style="flex: 1">${escapar(x.nombre)}<br><span class="sec">${x.matas} mata${x.matas > 1 ? 's' : ''} en el diseño</span></span><b class="num">${x.cantidad} ${x.unidad}</b></div>`;
      }),
      ...compras.hardscape.map(x => `<div><b style="width: 22px">·</b><span style="flex: 1">${escapar(x.nombre)}<br><span class="sec">${x.detalle}</span></span><b class="num">${x.cantidad} ${x.unidad}</b></div>`),
    ].join('') || '<div class="sec">Aún no hay nada en el diseño.</div>';
    pintarSustratoCompra();
    pintarAvisos();
    // Cuántas imágenes faltan (se sabe cuando el navegador intenta cargarlas).
    setTimeout(() => {
      const faltan = [...new Set([...$('di-vista').querySelectorAll('.falta-img')].map(x => x.textContent).filter(Boolean))];
      $('di-faltan').textContent = faltan.length
        ? `Faltan ${faltan.length} ${faltan.length > 1 ? 'imágenes' : 'imagen'} (${faltan.join(', ')}). Guárdalas en app/img/plantas/ y app/img/paisaje/ con el nombre de PROMPTS-IMAGENES.md.`
        : '';
    }, 700);
  }
  let verTodas = false; const gruposAbiertos = new Set();
  /**
   * Agregar compacto: el buscador (recorre todo el catálogo, rocas y troncos), una fila "En tu acuario" (máximo 6)
   * y "Ver todas": el catálogo agrupado por tipo, cada grupo plegado.
   */
  function pintarPaleta() {
    const { selP } = seleccion();
    const f = $('di-buscar').value.trim().toLowerCase();
    const chip = x => `<button type="button" class="chip planta" data-agregar='${JSON.stringify({ planta: x.planta, paisaje: x.paisaje })}'>+ ${escapar(x.texto)}${x.otra ? ' <span class="sec">(no está en tu lista)</span>' : ''}</button>`;
    if (f) {
      const todo = [
        ...selP.map(p => ({ planta: p.id, texto: p.nombre, busca: p.nombre + ' ' + p.cientifico })),
        ...PAISAJE.map(x => ({ paisaje: x.id, texto: x.nombre, busca: x.nombre })),
        ...plantas.filter(p => !selP.includes(p)).map(p => ({ planta: p.id, texto: p.nombre, busca: p.nombre + ' ' + p.cientifico, otra: true })),
      ].filter(x => x.busca.toLowerCase().includes(f));
      $('di-paleta').innerHTML = todo.length ? `<div class="chips envolver">${todo.map(chip).join('')}</div>` : '<span class="sec">Nada con ese nombre. Prueba con otra palabra.</span>';
      return;
    }
    const mias = selP.slice(0, 6).map(p => ({ planta: p.id, texto: p.nombre }));
    $('di-paleta').innerHTML = (mias.length ? `<span class="sec">En tu acuario</span><div class="chips envolver">${mias.map(chip).join('')}</div>` : '')
      + `<button type="button" class="chip" data-todas aria-expanded="${verTodas}" style="align-self: flex-start">${verTodas ? 'Ocultar la lista' : 'Ver todas'}</button>`
      + (verTodas ? `<div class="pila paleta-todas" style="gap: 2px">${gruposAgregar(plantas).map(g =>
        `<details class="plegable" data-grupo="${g.nombre}"${gruposAbiertos.has(g.nombre) ? ' open' : ''}><summary><span class="sec">${g.nombre} (${g.items.length})</span></summary>
          <div class="chips envolver" style="padding: 4px 0 8px">${g.items.map(chip).join('')}</div></details>`).join('')}</div>` : '');
  }
  // Recordar qué grupos de "Ver todas" están abiertos (el panel se vuelve a pintar con cada cambio).
  $('di-paleta').addEventListener('toggle', e => { const g = e.target.dataset?.grupo; if (g) e.target.open ? gruposAbiertos.add(g) : gruposAbiertos.delete(g); }, true);
  $('di-buscar').addEventListener('input', pintarPaleta);

  /** Barra de lo elegido: tamaño, voltear, duplicar, borrar. */
  function pintarBarra() {
    const o = elegido();
    $('di-sel').hidden = !o;
    $('di-ayuda').hidden = !!o;
    $('di-general').hidden = !!o; // con algo elegido, solo su edición
    $('di-varios').setAttribute('aria-pressed', varios);
    $('di-varios').textContent = varios ? 'Elegir varios: sí' : 'Elegir varios';
    // Sin nada elegido, deslizar sobre el dibujo desplaza la página (o el zoom); con algo elegido, lo mueve.
    $('di-arriba').style.touchAction = grupo.size ? 'none' : 'pan-y';
    tactil();
    if (!o) return;

    const pa = PAISAJE.find(z => z.id === o.paisaje);
    $('di-tipo-fila').hidden = !pa; $('di-forma-fila').hidden = !(pa?.variantes > 1);
    if (pa) {
      const familia = pa.id.split('-')[0]; // roca o tronco
      $('di-tipos').innerHTML = PAISAJE.filter(z => z.id.startsWith(familia + '-')).map(z =>
        `<button type="button" class="chip planta" data-tipo="${z.id}" aria-pressed="${z.id === pa.id}">${escapar(z.nombre)}</button>`).join('');
      const n = pa.variantes || 1;
      $('di-formas').innerHTML = Array.from({ length: n }, (_, i) =>
        `<button type="button" class="chip planta forma" data-forma="${i}" aria-pressed="${(o.v || 0) % n === i}"><img src="${archivoPaisaje(pa, i)}" alt="">${i + 1}</button>`).join('');
    }
    $('di-sel-nombre').textContent = grupo.size > 1 ? `${grupo.size} elegidos` : nombreDe(o) || '';
    $('di-tamano').value = Math.round((o.escala || 1) * 100);
    $('di-tamano-v').textContent = `${Math.round((o.escala || 1) * 100)} %`;
    const p = plantas.find(z => z.id === o.planta);
    $('di-copias-fila').hidden = !p;
    $('di-unir-fila').hidden = !p || grupo.size > 1;
    if (p && grupo.size === 1) pintarUnion(o);
    if (p) { const n = o.copias || (esAlfombra(p) ? 3 : !o.sobre && planoDe(o.b) === 'fondo' ? 4 : 3); $('di-copias').value = n; $('di-copias-v').textContent = n; }
    $('di-giro').value = o.rot || 0;
    $('di-giro-v').textContent = `${o.rot || 0}°`;
    pintarColor(o);
  }
  const cambiar = fn => { const lista = elegidos(); if (!lista.length) return; lista.forEach(fn); guardar(); pintarDisenador(); };

  // ---------- Unir una planta a una roca o tronco (X: a lo largo, Y: altura, Z: delante o detrás) ----------
  const textoX = v => v < 0 ? `izq. ${-v} %` : v > 0 ? `der. ${v} %` : 'al centro';
  const textoY = v => v <= 0 ? 'en la base' : v >= 100 ? 'en la punta' : `${v} % de la altura`;
  const LADOS = [[-1, 'Detrás'], [0, 'Encima'], [1, 'Delante']];
  function pintarUnion(o) {
    const r = soporteDe(o, diseno().objetos);
    $('di-unir').hidden = !!r;
    $('di-unir').setAttribute('aria-pressed', uniendo);
    $('di-unir').textContent = uniendo ? 'Toca la roca o tronco… (toca aquí para cancelar)' : 'Unir a roca o tronco';
    $('di-unido').hidden = !r;
    if (!r) return;
    $('di-unido-a').textContent = `Unida a ${nombreDe(r)}: se mueve, gira y crece con ella.`;
    $('di-ux').value = o.sobre.x; $('di-ux-v').textContent = textoX(o.sobre.x);
    $('di-uy').value = o.sobre.y; $('di-uy-v').textContent = textoY(o.sobre.y);
    const z = Math.sign(o.sobre.z || 0);
    $('di-uz').innerHTML = LADOS.map(([v, n]) => `<button type="button" class="chip planta" data-uz="${v}" aria-pressed="${z === v}">${n}</button>`).join('');
  }
  /** Une la planta elegida a la roca o tronco r, en el punto l (coordenadas de la roca). */
  function unirA(r, l) {
    const o = elegido(); if (!o?.planta) return;
    o.sobre = { id: r.id, x: Math.round(Math.max(-50, Math.min(50, l.x))), y: Math.round(Math.max(0, Math.min(100, l.y))), z: 0 };
    uniendo = false; guardar(); pintarDisenador();
    avisar(`${nombreDe(o)} quedó unida a ${nombreDe(r)}. Ajusta el lugar con los controles o arrastrándola sobre ella.`);
  }
  $('di-unir').onclick = () => {
    uniendo = !uniendo; pintarBarra();
    if (uniendo) avisar('Toca en el dibujo la roca o tronco donde va (en el punto exacto), o su mancha en la vista de arriba.');
  };
  /** Cambia un eje de la unión; en vivo (sin guardar) mientras se desliza. */
  function ajustarUnion(eje, v) {
    const o = elegido(); if (!o?.sobre) return;
    v = Math.round(Math.max(eje === 'x' ? -50 : 0, Math.min(eje === 'x' ? 50 : 100, v)));
    o.sobre = { ...o.sobre, [eje]: v };
    $(`di-u${eje}`).value = v; $(`di-u${eje}-v`).textContent = (eje === 'x' ? textoX : textoY)(v);
    repintarEnVivo([o.id]);
  }
  $('di-ux').oninput = e => ajustarUnion('x', +e.target.value);
  $('di-uy').oninput = e => ajustarUnion('y', +e.target.value);
  $('di-ux').onchange = $('di-uy').onchange = () => { guardar(); pintarArriba(); };
  $('di-unido').addEventListener('click', e => {
    const b = e.target.closest('[data-eje]');
    if (b) { const o = elegido(); if (o?.sobre) { ajustarUnion(b.dataset.eje, o.sobre[b.dataset.eje] + +b.dataset.d); guardar(); } return; }
    const z = e.target.closest('[data-uz]');
    if (z) { const o = elegido(); if (o?.sobre) { o.sobre = { ...o.sobre, z: +z.dataset.uz }; guardar(); pintarDisenador(); } }
  });
  $('di-separar').onclick = () => {
    const o = elegido(), r = soporteDe(o, diseno().objetos); if (!r) return;
    const ap = apoyo(o, contexto());
    o.x = Math.min(100, Math.max(0, ap.x)); o.b = bDe(profundidad(r.b) + 0.06); delete o.sobre; // a la arena, justo delante
    guardar(); pintarDisenador();
    avisar(`${nombreDe(o)} volvió a la arena, delante de ${nombreDe(r)}.`);
  };

  $('di-paleta').addEventListener('click', e => {
    if (e.target.closest('[data-todas]')) { verTodas = !verTodas; return pintarPaleta(); }
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
  // Color de lo elegido (uno, varios o toda la especie): Color = saturación, Brillo y Tono. Se guarda en o.color.
  const COLOR = { sat: [100, v => `${v} %`], brillo: [100, v => `${v} %`], tono: [0, v => `${v > 0 ? '+' : ''}${v}°`] };
  function pintarColor(o) {
    for (const [k, [base, texto]] of Object.entries(COLOR)) {
      const v = o.color?.[k] ?? base; $(`di-${k}`).value = v; $(`di-${k}-v`).textContent = texto(v);
    }
  }
  for (const [k, [base, texto]] of Object.entries(COLOR)) {
    $(`di-${k}`).oninput = e => {
      if (!grupo.size) return;
      const v = +e.target.value;
      for (const o of elegidos()) {
        o.color = { ...o.color, [k]: v };
        if (Object.entries(COLOR).every(([j, [b]]) => (o.color[j] ?? b) === b)) delete o.color; // de vuelta al original
      }
      $(`di-${k}-v`).textContent = texto(v);
      repintarEnVivo([...grupo]);
    };
    $(`di-${k}`).onchange = () => { guardar(); pintarDisenador(); };
  }
  $('di-color-0').onclick = () => cambiar(o => { delete o.color; });
  $('di-profundidad').onclick = () => {
    const d = diseno(); d.profundidad = d.profundidad === false; // undefined (encendida) ⇄ false
    if (d.profundidad) delete d.profundidad;
    guardar(); pintarDisenador();
    avisar(d.profundidad === false ? 'Profundidad apagada: todo con su color, atrás y adelante.' : 'Profundidad encendida: lo de atrás se ve un poco más oscuro, como en un acuario real.');
  };
  $('di-voltear').onclick = () => cambiar(o => { o.espejo = !o.espejo; });
  // Bloquear: lo bloqueado no se elige al tocarlo (el toque pasa a lo de atrás). Se dibuja igual; en el diseñador lleva un candado.
  $('di-bloquear').onclick = () => {
    const n = grupo.size; if (!n) return;
    for (const o of elegidos()) o.bloqueado = true;
    elegir(null); guardar(); pintarDisenador();
    avisar(`${n > 1 ? `${n} cosas bloqueadas` : 'Bloqueado'}: ya no se elige al tocarlo. Para desbloquear, abre "Bloqueados".`);
  };
  function pintarBloqueados() {
    const lista = diseno().objetos.filter(o => o.bloqueado);
    $('di-bloqueados').hidden = !lista.length;
    $('di-bloqueados-t').textContent = `Bloqueados (${lista.length})`;
    $('di-bloqueados-lista').innerHTML = lista.map(o => `<div><span style="flex: 1">${escapar(nombreDe(o) || '')}</span>
      <button type="button" class="chip" data-desbloquear="${o.id}">Desbloquear</button></div>`).join('');
  }
  $('di-bloqueados-lista').addEventListener('click', e => {
    const b = e.target.closest('[data-desbloquear]'); if (!b) return;
    const o = diseno().objetos.find(z => z.id === b.dataset.desbloquear); if (!o) return;
    delete o.bloqueado; elegir(o.id); guardar(); pintarDisenador();
    avisar(`${nombreDe(o)} desbloqueado y elegido.`);
  });
  $('di-desbloquear-todos').onclick = () => {
    for (const o of diseno().objetos) delete o.bloqueado;
    guardar(); pintarDisenador(); avisar('Todo desbloqueado.');
  };
  $('di-tipos').addEventListener('click', e => {
    const b = e.target.closest('[data-tipo]'); if (!b) return;
    const familia = b.dataset.tipo.split('-')[0];
    cambiar(o => { if (o.paisaje?.startsWith(familia + '-')) { o.paisaje = b.dataset.tipo; o.v = 0; } });
  });
  $('di-formas').addEventListener('click', e => {
    const b = e.target.closest('[data-forma]'); if (!b) return;
    const tipo = elegido()?.paisaje;
    cambiar(o => { if (o.paisaje === tipo) o.v = +b.dataset.forma; });
  });
  $('di-frente').onclick = () => cambiar(o => { o.orden = (o.orden || 0) + 1; });
  $('di-atras').onclick = () => cambiar(o => { o.orden = (o.orden || 0) - 1; });
  $('di-duplicar').onclick = () => {
    const copias = elegidos().map(o => ({ ...o, id: nuevoId(), x: Math.min(98, o.x + 8), v: (o.v || 0) + 1,
      ...(o.sobre && { sobre: { ...o.sobre, x: o.sobre.x > 30 ? o.sobre.x - 15 : o.sobre.x + 15 } }) }));
    if (!copias.length) return;
    diseno().objetos.push(...copias);
    sel = copias[0].id; grupo = new Set(copias.map(o => o.id)); guardar(); pintarDisenador();
  };
  $('di-borrar').onclick = () => {
    if (!grupo.size) return;
    // Las plantas unidas a una roca o tronco que se borra bajan a la arena, donde estaban.
    const objs = diseno().objetos, ctx = contexto();
    for (const o of objs) {
      const r = soporteDe(o, objs);
      if (r && grupo.has(r.id) && !grupo.has(o.id)) { o.x = apoyo(o, ctx).x; o.b = r.b; delete o.sobre; }
    }
    diseno().objetos = objs.filter(z => !grupo.has(z.id)); elegir(null); guardar(); pintarDisenador();
  };
  $('di-soltar').onclick = () => { elegir(null); varios = false; pintarDisenador(); };
  $('di-varios').onclick = () => { varios = !varios; pintarBarra(); avisar(varios ? 'Toca cada cosa que quieras sumar o quitar del grupo. Arrastra una y se mueven todas.' : 'Elegir varios: apagado.'); };
  $('di-especie').onclick = () => { // todas las matas de la misma especie (o rocas del mismo tipo)
    const o = elegido(); if (!o) return;
    grupo = new Set(diseno().objetos.filter(z => !z.bloqueado && (o.planta ? z.planta === o.planta : z.paisaje === o.paisaje)).map(z => z.id));
    pintarDisenador();
  };
  // ---------- Tocar y arrastrar ----------
  // Primer toque: elige (la página sigue pudiendo desplazarse). Con algo elegido, arrastrarlo lo mueve.
  // Así no se mueven plantas sin querer al desplazar la página.
  const alfas = new Map();
  /** ¿Hay imagen visible (no transparente) en ese punto? Considera giro y volteo. */
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
    const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight), llena = img.classList.contains('alf'); // alfombra: llena su caja
    const w = llena ? r.width : img.naturalWidth * s, h = llena ? r.height : img.naturalHeight * s, izq = r.left + (r.width - w) / 2, arriba = r.top + r.height - h;
    let u = (x - izq) / w; const v = (y - arriba) / h;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    if (img.style.transform.includes('scaleX(-1)')) u = 1 - u;
    return m.ctx.getImageData(Math.min(m.w - 1, u * m.w | 0), Math.min(m.h - 1, v * m.h | 0), 1, 1).data[3] > 40;
  }
  /** ¿Se puede elegir tocándolo? Lo bloqueado no: el toque pasa a lo que está detrás. */
  const elegible = el => el.dataset?.o && $('di-vista').contains(el) && !diseno().objetos.find(z => z.id === el.dataset.o)?.bloqueado;
  /** Qué hay bajo el dedo: primero donde se ve exacto; si no, a unos píxeles (ramas finas del Manzanita o Spider). */
  function bajoElDedo(x, y) {
    const pilas = document.elementsFromPoint(x, y).filter(elegible);
    const exacto = pilas.find(el => el.tagName !== 'IMG' || opaco(el, x, y));
    if (exacto) return exacto.dataset.o;
    const R = 9, cerca = [[R, 0], [-R, 0], [0, R], [0, -R], [R, R], [-R, -R], [R, -R], [-R, R]];
    for (const [dx, dy] of cerca) {
      const el = document.elementsFromPoint(x + dx, y + dy).find(z => elegible(z) && (z.tagName !== 'IMG' || opaco(z, x + dx, y + dy)));
      if (el) return el.dataset.o;
    }
    return null;
  }
  /** Todo lo visible bajo el dedo, de adelante hacia atrás (para pasar al de atrás tocando otra vez). Con incluirBloqueados, también lo bloqueado. */
  function todosBajoElDedo(x, y, incluirBloqueados = false) {
    return [...new Set(document.elementsFromPoint(x, y)
      .filter(el => (incluirBloqueados ? el.dataset?.o && $('di-vista').contains(el) : elegible(el)) && (el.tagName !== 'IMG' || opaco(el, x, y)))
      .map(el => el.dataset.o))];
  }
  const contexto = () => ({ largo: datos.acuario.largo, alto: datos.acuario.alto, catalogo: plantas, sustrato: diseno().sustrato, objetos: diseno().objetos, profundidad: diseno().profundidad !== false });
  /** Lo que se mueve: lo elegido (lo unido a sus rocas o troncos va con ellas solo). */
  const quienesSeMueven = () => elegidos().map(o => o.id);
  /**
   * Aplica un desplazamiento: dx en % del largo, dd en profundidad (0 a 1 = de atrás al frente), dy en % del alto (solo
   * para lo unido a una roca: sube o baja sobre ella). Todo queda en la arena: nada flota. Cerca del vidrio o del fondo,
   * se pega al borde (imán).
   */
  function mover(ids, { dx = 0, dd = 0, dy = 0 }) {
    const objs = diseno().objetos, ctx = contexto(), mueven = new Set(ids);
    for (const o of objs.filter(z => mueven.has(z.id))) {
      const r = soporteDe(o, objs);
      if (r) {
        if (mueven.has(r.id)) continue; // va con su roca o tronco
        const ap = apoyo(o, ctx), l = sobreDesdePunto(r, ap.x + dx, ap.y + dy, ctx);
        if (Math.abs(l.x) <= 70 && l.y >= -25 && l.y <= 125) o.sobre = { ...o.sobre, x: Math.round(Math.max(-50, Math.min(50, l.x))), y: Math.round(Math.max(0, Math.min(100, l.y))) };
        else { delete o.sobre; o.x = Math.min(100, Math.max(0, ap.x + dx)); o.b = bDe(profundidad(r.b) + dd); } // arrastrada lejos: se separa
        continue;
      }
      o.x = Math.min(100, Math.max(0, o.x + dx));
      let d = profundidad(o.b) + dd; if (d < 0.03) d = 0; if (d > 0.97) d = 1; o.b = bDe(d);
    }
  }
  /**
   * Redibuja solo lo que se mueve (y lo unido a ello), cambiando el estilo de sus imágenes: rápido y sin parpadeo.
   * Si no se puede (cambió cuántas piezas tiene), redibuja toda la vista.
   */
  let cuadro = 0;
  function repintarEnVivo(ids) {
    cancelAnimationFrame(cuadro);
    cuadro = requestAnimationFrame(() => {
      const vista = $('di-vista'), ctx = contexto(), todos = new Set(ids);
      for (const o of ctx.objetos) if (o.sobre && todos.has(o.sobre.id)) todos.add(o.id);
      for (const id of todos) {
        const o = ctx.objetos.find(z => z.id === id); if (!o) continue;
        const t = document.createElement('template'); t.innerHTML = dibujarObjeto(o, ctx);
        const nuevos = [...t.content.children], viejos = [...vista.querySelectorAll(`[data-o="${id}"], [data-s="${id}"]`)];
        if (nuevos.length !== viejos.length) return dibujar('di-vista', colorVista(), [...grupo]);
        viejos.forEach((el, i) => {
          const c = el.style.getPropertyValue('--c'); // color del marcador de imagen que falta
          el.setAttribute('style', nuevos[i].getAttribute('style') + (c ? `;--c:${c}` : ''));
        });
      }
    });
  }
  /** Si una epífita se suelta con el dedo sobre una roca o tronco (donde se ve), queda unida en ese punto. */
  function unirSiCaeEnRoca(id, caja, px, py) {
    const objs = diseno().objetos, o = objs.find(z => z.id === id), p = plantas.find(z => z.id === o?.planta);
    if (!p || p.zona !== 'epifita' || o.sobre) return;
    const el = document.elementsFromPoint(px, py).find(z => z.tagName === 'IMG' && z.dataset.o !== id && objs.find(r => r.id === z.dataset.o)?.paisaje && opaco(z, px, py));
    const r = el && objs.find(z => z.id === el.dataset.o); if (!r) return;
    const l = sobreDesdePunto(r, (px - caja.left) / caja.width * 100, (py - caja.top) / caja.height * 100, contexto());
    o.sobre = { id: r.id, x: Math.round(Math.max(-50, Math.min(50, l.x))), y: Math.round(Math.max(0, Math.min(100, l.y))), z: 0 };
    avisar(`${p.nombre} quedó unida a ${nombreDe(r)}: se mueve con ella. Arrástrala lejos para separarla.`);
  }
  function elegirConToque(id) {
    if (varios) {
      if (grupo.has(id) && grupo.size > 1) { grupo.delete(id); sel = [...grupo][0]; } // tocar de nuevo = quitar
      else { grupo.add(id); sel = id; }
    } else elegir(id);
    pintarDisenador();
  }

  let arrastre = null;
  $('di-vista').addEventListener('contextmenu', e => e.preventDefault()); // sin menú de copiar/descargar al mantener el dedo
  $('di-vista').addEventListener('pointerdown', e => {
    if (uniendo) { // tocar la roca o tronco donde va la planta, en el punto exacto
      e.preventDefault();
      const objs = diseno().objetos, esPaisaje = k => objs.find(z => z.id === k)?.paisaje;
      const id = todosBajoElDedo(e.clientX, e.clientY, true).find(esPaisaje) || [bajoElDedo(e.clientX, e.clientY)].find(esPaisaje);
      if (!id) return avisar('Ahí no hay roca ni tronco. Toca una roca o tronco, o cancela con el botón.');
      const r = objs.find(z => z.id === id), caja = $('di-vista').querySelector('.vista-frontal').getBoundingClientRect();
      return unirA(r, sobreDesdePunto(r, (e.clientX - caja.left) / caja.width * 100, (e.clientY - caja.top) / caja.height * 100, contexto()));
    }
    // Si lo elegido está bajo el dedo (aunque tenga algo encima), este toque es para él: arrastrar o pasar al de atrás.
    const pila = todosBajoElDedo(e.clientX, e.clientY);
    const id = !varios && pila.includes(sel) ? sel : pila[0] || bajoElDedo(e.clientX, e.clientY);
    if (!id) { if (grupo.size && !varios) { elegir(null); pintarDisenador(); } return; }
    if (!grupo.has(id) || varios) return elegirConToque(id); // primer toque: solo elegir
    sel = id;
    const caja = $('di-vista').querySelector('.vista-frontal').getBoundingClientRect();
    arrastre = { ids: quienesSeMueven(), x0: e.clientX, y0: e.clientY, caja, movio: false, antes: structuredClone(diseno().objetos) };
    try { $('di-vista').setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
    e.preventDefault();
  });
  /**
   * Arrastre en vivo: se recalcula desde el inicio (sin errores acumulados) y se dibuja como quedará: lo que ves es lo que queda.
   * De lado sigue al dedo; hacia arriba/abajo, todo el alto de la vista equivale a ir del frente al fondo (suave).
   */
  const pasoFrente = e => {
    const r = arrastre, dx = e.clientX - r.x0, dy = e.clientY - r.y0;
    diseno().objetos = structuredClone(r.antes);
    mover(r.ids, { dx: dx / r.caja.width * 100, dd: dy / r.caja.height, dy: dy / r.caja.height * 100 });
  };
  $('di-vista').addEventListener('pointermove', e => {
    if (!arrastre) return;
    if (Math.abs(e.clientX - arrastre.x0) + Math.abs(e.clientY - arrastre.y0) > 4) arrastre.movio = true;
    if (!arrastre.movio) return;
    pasoFrente(e);
    repintarEnVivo(arrastre.ids);
  });
  const soltar = e => {
    if (!arrastre) return;
    const { ids, caja, movio, antes } = arrastre;
    if (!movio) { // tocar otra vez sin arrastrar: elegir lo que está detrás (p. ej. un tronco tapado por su helecho)
      arrastre = null; diseno().objetos = antes;
      const pila = todosBajoElDedo(e.clientX, e.clientY);
      if (!varios && pila.length > 1) { elegir(pila[(pila.indexOf(sel) + 1) % pila.length]); pintarDisenador(); avisar(`Elegido: ${nombreDe(elegido())}. Toca otra vez para pasar al de atrás.`); }
      return;
    }
    if (e.type === 'pointerup') pasoFrente(e);
    arrastre = null;
    cancelAnimationFrame(cuadro);
    if (ids.length === 1) unirSiCaeEnRoca(ids[0], caja, e.clientX, e.clientY);
    guardar(); pintarDisenador();
  };
  $('di-vista').addEventListener('pointerup', soltar);
  $('di-vista').addEventListener('pointercancel', soltar);

  // ---------- Zoom de la vista frontal (1× a 4×) ----------
  // La vista se hace más ancha dentro de una caja que se desplaza: tocar, elegir y arrastrar funcionan igual a cualquier zoom.
  // Un dedo: elegir y arrastrar. Dos dedos: pellizcar para acercar y mover para desplazarse. Se olvida al cerrar el diseñador.
  const ZOOM_MAX = 4, PASOS_ZOOM = [1, 1.5, 2, 3, 4];
  let zoom = 1;
  const cajaZoom = $('di-zoom-caja');
  /** Cambia el zoom dejando quieto el punto (px, py) de la pantalla (por defecto, el centro de la caja). */
  function ponerZoom(z, px, py) {
    const caja = cajaZoom.getBoundingClientRect(), vista = $('di-vista');
    z = Math.round(Math.min(ZOOM_MAX, Math.max(1, z)) * 100) / 100;
    if (z === zoom && z !== 1) return;
    px ??= caja.left + caja.width / 2; py ??= caja.top + caja.height / 2;
    // Punto del dibujo bajo (px, py), en px del dibujo a zoom 1 (el dibujo puede estar centrado en la caja).
    const antes = vista.getBoundingClientRect(), fx = (px - antes.left) / zoom, fy = (py - antes.top) / zoom;
    if (zoom === 1 && z > 1) cajaZoom.style.height = `${cajaZoom.offsetHeight}px`; // la ventana conserva el alto de 1×
    zoom = z;
    vista.style.setProperty('--zoom', z);
    if (z === 1) { cajaZoom.style.height = ''; cajaZoom.scrollTo(0, 0); }
    else { const d = vista.getBoundingClientRect(); cajaZoom.scrollLeft += d.left + fx * z - px; cajaZoom.scrollTop += d.top + fy * z - py; }
    $('di-zoom-v').textContent = `${Math.round(z * 10) / 10}×`.replace('.', ',');
    $('di-zoom-menos').disabled = z <= 1; $('di-zoom-mas').disabled = z >= ZOOM_MAX; $('di-zoom-ajustar').disabled = z === 1;
    tactil();
  }
  /** Gestos del navegador sobre el dibujo: con algo elegido, ninguno (el dedo lo mueve); si no, desplazar (y con zoom, también de lado). */
  function tactil() {
    $('di-vista').style.touchAction = grupo.size ? 'none' : zoom > 1 ? 'pan-x pan-y' : 'pan-y';
  }
  $('di-zoom-mas').onclick = () => ponerZoom(PASOS_ZOOM.find(z => z > zoom + 0.01) || ZOOM_MAX);
  $('di-zoom-menos').onclick = () => ponerZoom([...PASOS_ZOOM].reverse().find(z => z < zoom - 0.01) || 1);
  $('di-zoom-ajustar').onclick = () => ponerZoom(1);
  // Pellizco: se escuchan los dedos antes que el arrastre (fase de captura); con dos dedos, el arrastre se cancela.
  const dedos = new Map();
  let pellizco = null, eleccionAntes = null; // lo elegido antes del primer dedo: un pellizco no elige nada

  const datosPellizco = () => {
    const [a, b] = [...dedos.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  cajaZoom.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    // Primer dedo de un toque nuevo: olvidar dedos cuyo "levantar" se perdió (p. ej. el dibujo se redibujó bajo el dedo); si no, un toque se toma por pellizco.
    if (e.isPrimary) { dedos.clear(); pellizco = null; }
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size === 1) { eleccionAntes = { sel, grupo: new Set(grupo) }; return; }
    e.stopPropagation(); e.preventDefault();
    if (arrastre) { diseno().objetos = arrastre.antes; arrastre = null; cancelAnimationFrame(cuadro); }
    if (eleccionAntes && (eleccionAntes.sel !== sel || eleccionAntes.grupo.size !== grupo.size)) { sel = eleccionAntes.sel; grupo = eleccionAntes.grupo; }
    pintarDisenador();
    const p = datosPellizco();
    pellizco = { d0: p.d, z0: zoom, x: p.x, y: p.y };
    for (const id of dedos.keys()) try { cajaZoom.setPointerCapture(id); } catch { /* */ }
  }, true);
  cajaZoom.addEventListener('pointermove', e => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pellizco || dedos.size < 2) return;
    e.stopPropagation();
    const p = datosPellizco();
    ponerZoom(pellizco.z0 * p.d / pellizco.d0, p.x, p.y);
    cajaZoom.scrollLeft -= p.x - pellizco.x; cajaZoom.scrollTop -= p.y - pellizco.y; // mover con los dos dedos
    pellizco.x = p.x; pellizco.y = p.y;
  }, true);
  const quitarDedo = e => {
    if (!dedos.delete(e.pointerId)) return;
    if (pellizco) { e.stopPropagation(); if (!dedos.size) pellizco = null; }
  };
  cajaZoom.addEventListener('pointerup', quitarDedo, true);
  cajaZoom.addEventListener('pointercancel', quitarDedo, true);
  // Trackpad o Ctrl + rueda en computadora.
  cajaZoom.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    ponerZoom(zoom * Math.exp(-e.deltaY / 200), e.clientX, e.clientY);
  }, { passive: false });
  // Al girar la pantalla (cambia el ancho, no solo la barra del navegador): se rehace la caja y se conserva el zoom y lo que se veía al centro.
  let anchoAntes = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === anchoAntes) return;
    anchoAntes = innerWidth;
    if (zoom <= 1 || $('disenador').hidden) return;
    const z = zoom, v = $('di-vista').getBoundingClientRect(), c = cajaZoom.getBoundingClientRect();
    const fx = (c.left + c.width / 2 - v.left) / v.width, fy = (c.top + c.height / 2 - v.top) / v.height;
    ponerZoom(1);
    requestAnimationFrame(() => {
      ponerZoom(z);
      const v2 = $('di-vista').getBoundingClientRect(), c2 = cajaZoom.getBoundingClientRect();
      cajaZoom.scrollLeft += v2.left + fx * v2.width - (c2.left + c2.width / 2);
      cajaZoom.scrollTop += v2.top + fy * v2.height - (c2.top + c2.height / 2);
    });
  });

  // ---------- Celular acostado: el dibujo a pantalla completa, herramientas en un panel flotante ----------
  function pintarAcostado() {
    const oculto = $('disenador').dataset.herr === 'oculto';
    $('di-herr').textContent = oculto ? 'Herramientas' : 'Ocultar';
    $('di-herr').setAttribute('aria-expanded', !oculto);
    $('di-completa').hidden = !acostado.matches || instalada() || !document.documentElement.requestFullscreen;
    $('di-completa').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
  }
  $('di-herr').onclick = () => {
    $('disenador').dataset.herr = $('disenador').dataset.herr === 'oculto' ? '' : 'oculto';
    pintarAcostado();
  };
  $('di-completa').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => avisar('El navegador no dejó usar pantalla completa.'));
  };
  acostado.addEventListener('change', pintarAcostado);
  document.addEventListener('fullscreenchange', pintarAcostado);
  pintarAcostado();

  // Vista desde arriba: tocar elige; con algo elegido, arrastrar lo mueve (de lado y hacia adelante/atrás).
  let arrastreArriba = null;
  $('di-arriba').addEventListener('contextmenu', e => e.preventDefault());
  $('di-arriba').addEventListener('pointerdown', e => {
    if (editandoMalla) return pincelar(e, true);
    if (uniendo) { // desde arriba: la planta queda a lo largo donde se tocó, a media altura
      const objs = diseno().objetos;
      const id = document.elementsFromPoint(e.clientX, e.clientY).map(z => z.closest?.('[data-o]')?.dataset.o).find(k => objs.find(z => z.id === k)?.paisaje);
      if (!id) return avisar('Ahí no hay roca ni tronco. Toca una roca o tronco, o cancela con el botón.');
      const r = objs.find(z => z.id === id), pa = PAISAJE.find(z => z.id === r.paisaje), a = datos.acuario;
      const svg = $('di-arriba').querySelector('svg').getBoundingClientRect(), xCm = (e.clientX - svg.left) * (a.largo + 4) / svg.width - 2;
      return unirA(r, { x: (xCm - r.x / 100 * a.largo) / (20 * pa.ancho * (r.escala || 1)) * 100 * (r.espejo ? -1 : 1), y: 60 });
    }
    const pila = [...new Set(document.elementsFromPoint(e.clientX, e.clientY).map(z => z.closest?.('[data-o]')?.dataset.o)
      .filter(id => id && !diseno().objetos.find(z => z.id === id)?.bloqueado))];
    if (!pila.length) return;
    const id = !varios && pila.includes(sel) ? sel : pila[0];
    if (!grupo.has(id) || varios) return elegirConToque(id);
    sel = id;
    const svg = $('di-arriba').querySelector('svg').getBoundingClientRect();
    const a = datos.acuario;
    arrastreArriba = { ids: quienesSeMueven(), x0: e.clientX, y0: e.clientY, cm: (a.largo + 4) / svg.width, antes: structuredClone(diseno().objetos), pila };
    try { $('di-arriba').setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
    e.preventDefault();
  });
  const pasoArriba = e => {
    const r = arrastreArriba, a = datos.acuario;
    diseno().objetos = structuredClone(r.antes); // se recalcula desde el inicio del arrastre: sin errores acumulados
    const dxCm = (e.clientX - r.x0) * r.cm, dyCm = (e.clientY - r.y0) * r.cm;
    mover(r.ids, { dx: dxCm / a.largo * 100, dd: dyCm / a.ancho }); // lo unido a una roca solo se corre a lo largo de ella
  };
  $('di-arriba').addEventListener('pointermove', e => {
    if (editandoMalla) return pincelar(e, false);
    if (!arrastreArriba) return;
    pasoArriba(e);
    pintarArriba();
    repintarEnVivo(arrastreArriba.ids);
  });
  const soltarArriba = e => {
    pincel.activo = false;
    if (!arrastreArriba) return;
    const { x0, y0, pila } = arrastreArriba;
    if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) <= 4) { // tocar otra vez sin arrastrar: el de abajo
      diseno().objetos = arrastreArriba.antes; arrastreArriba = null;
      if (pila.length > 1) { elegir(pila[(pila.indexOf(sel) + 1) % pila.length]); avisar(`Elegido: ${nombreDe(elegido())}. Toca otra vez para pasar al de abajo.`); }
      return pintarDisenador();
    }
    pasoArriba(e); arrastreArriba = null;
    guardar(); pintarDisenador();
  };
  $('di-arriba').addEventListener('pointerup', soltarArriba);
  $('di-arriba').addEventListener('pointercancel', soltarArriba);

  function pintarAvisos() {
    const a = datos.acuario, avisos = avisosDiseno(diseno().objetos, plantas, a.alto);
    if (sustratoMasAlto(diseno().sustrato) > ALTO_AVISO)
      avisos.push(`El sustrato pasa de ${ALTO_AVISO} cm en una zona: ${tipoSustrato(a) === 'aquasoil' ? 'el aquasoil muy alto' : 'la arena muy alta'} se compacta; usa rocas o bolsas de malla para sostenerlo.`);
    $('di-avisos-lista').innerHTML = avisos.map(x => `<p>${escapar(x)}</p>`).join('');
    $('di-avisos-t').textContent = `Recomendaciones (${avisos.length})`;
    $('di-avisos').hidden = !avisos.length;
    // Consejos de composición (suaves). La guía de tercios se puede ver mientras haga falta o esté encendida.
    const consejos = consejosComposicion(diseno().objetos, plantas, a.largo), tercios = $('di-vista').classList.contains('tercios');
    const conGuia = consejos.some(c => c.guia) || tercios;
    $('di-consejos-t').textContent = `Consejos de composición (${consejos.length})`;
    $('di-consejos-lista').innerHTML = consejos.map(c => `<p>${escapar(c.texto)}</p>`).join('') +
      (conGuia ? `<button type="button" class="chip" id="di-tercios" aria-pressed="${tercios}">${tercios ? 'Ocultar guía de tercios' : 'Ver guía de tercios'}</button>` : '');
    $('di-consejos').hidden = !consejos.length && !tercios;
  }
  $('di-consejos').addEventListener('click', e => {
    if (!e.target.closest('#di-tercios')) return;
    $('di-vista').classList.toggle('tercios'); pintarAvisos();
  });
  // ---------- Forma del sustrato ----------
  function pintarArriba() {
    $('di-arriba').innerHTML = vistaSuperior({ acuario: datos.acuario, objetos: diseno().objetos, catalogo: plantas, seleccion: [...grupo],
      sustrato: diseno().sustrato, malla: editandoMalla ? { elegidos: [...puntos] } : null });
  }
  /** Controles de atajo: altura al frente, cuánto más alto atrás (con la altura total) y la forma. */
  function pintarAtajos() {
    const s = diseno().sustrato, frente = s.frente ?? 3, atras = s.perfil === 'parejo' ? 0 : s.atras || 0;
    $('di-frente-alto').value = frente; $('di-frente-alto-v').textContent = `${frente} cm`;
    $('di-pendiente').value = atras;
    $('di-pendiente-v').textContent = atras ? `atrás ${frente + atras} cm (${frente} al frente + ${atras})` : '0 cm (parejo)';
    $('di-perfiles').innerHTML = PERFILES.map(x => `<button type="button" class="chip planta" data-perfil="${x.id}" aria-pressed="${!s.malla?.editada && (s.perfil || 'plano') === x.id}">${x.nombre}</button>`).join('');
  }
  /** Rehace la malla desde los atajos. Si se le dio forma a mano, pregunta antes de reemplazarla. */
  function aplicarAtajo(cambios) {
    const s = diseno().sustrato;
    if (s.malla?.editada && !confirm('¿Reemplazar la forma que le diste a mano al sustrato?')) { pintarAtajos(); return false; }
    Object.assign(s, cambios);
    s.malla = mallaDesde(s, datos.acuario.alto);
    return true;
  }
  /** Cambio en la malla: redibuja frente, arriba y la compra. */
  function mallaCambio(guardarYa = true) {
    dibujar('di-vista', colorVista(), [...grupo]); pintarArriba(); pintarSustratoCompra(); pintarMalla(); pintarAtajos(); pintarAvisos();
    if (guardarYa) guardar();
  }
  let editandoMalla = false, puntos = new Set(), tamPincel = 1;
  const PINCELES = [['Chico', 0], ['Mediano', 1], ['Grande', 2]];
  const pincel = { activo: false };
  function pintarMalla() {
    $('di-malla').hidden = !editandoMalla;
    $('di-malla-editar').textContent = editandoMalla ? 'Dando forma: usa la vista de arriba' : 'Dar forma a mano (vista de arriba)';
    if (!editandoMalla) return;
    $('di-pincel').innerHTML = PINCELES.map(([n, r]) => `<button type="button" class="chip planta" data-pincel="${r}" aria-pressed="${tamPincel === r}">${n}</button>`).join('');
    const m = diseno().sustrato.malla, alts = [...puntos].map(i => m.cm[i]);
    const max = altoMax(datos.acuario.alto);
    $('di-malla-alto').max = max;
    for (const id of ['di-malla-bajar', 'di-malla-subir', 'di-malla-alto', 'di-malla-quitar']) $(id).disabled = !puntos.size;
    if (alts.length) {
      const prom = alts.reduce((a, b) => a + b, 0) / alts.length, lo = Math.min(...alts), hi = Math.max(...alts);
      $('di-malla-alto').value = prom;
      $('di-malla-alto-v').textContent = lo === hi ? `${lo} cm` : `${Math.round(lo)}–${Math.round(hi)} cm`;
      $('di-malla-info').textContent = `${puntos.size} punto${puntos.size > 1 ? 's' : ''} elegido${puntos.size > 1 ? 's' : ''}. Mínimo ${ALTO_MIN} cm, máximo ${max} cm.`;
    } else {
      $('di-malla-alto-v').textContent = '–';
      $('di-malla-info').textContent = 'Toca o pasa el dedo por los puntos para elegir una zona. Más claro = más alto.';
    }
  }
  /** Elige los puntos de la malla bajo el dedo (con el tamaño de pincel). */
  function pincelar(e, inicio) {
    if (inicio) { pincel.activo = true; try { $('di-arriba').setPointerCapture(e.pointerId); } catch { /* */ } e.preventDefault(); }
    if (!pincel.activo) return;
    const svg = $('di-arriba').querySelector('svg'), caja = svg.getBoundingClientRect(), a = datos.acuario;
    const k = (a.largo + 4) / caja.width, x = (e.clientX - caja.left) * k - 2, y = (e.clientY - caja.top) * k - 2;
    const { cols, filas } = MALLA, paso = Math.max(a.largo / (cols - 1), a.ancho / (filas - 1));
    const radio = [0.55, 1.1, 1.9][tamPincel] * paso;
    const antes = puntos.size;
    for (let i = 0; i < cols * filas; i++) {
      const px = (i % cols) / (cols - 1) * a.largo, py = Math.floor(i / cols) / (filas - 1) * a.ancho;
      if (Math.hypot(px - x, py - y) <= radio) puntos.add(i);
    }
    if (puntos.size !== antes) { pintarArriba(); pintarMalla(); }
  }
  const cambiarZona = fn => {
    if (!puntos.size) return;
    const s = diseno().sustrato, max = altoMax(datos.acuario.alto), cm = [...s.malla.cm];
    for (const i of puntos) cm[i] = Math.round(Math.max(ALTO_MIN, Math.min(max, fn(cm[i]))) * 10) / 10;
    s.malla = { ...s.malla, cm, editada: true };
    mallaCambio();
  };
  $('di-malla-editar').onclick = () => {
    editandoMalla = !editandoMalla; puntos = new Set();
    if (editandoMalla) { elegir(null); pintarDisenador(); $('di-arriba').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else pintarDisenador();
  };
  $('di-malla-listo').onclick = () => { editandoMalla = false; puntos = new Set(); pintarDisenador(); };
  $('di-pincel').addEventListener('click', e => { const b = e.target.closest('[data-pincel]'); if (b) { tamPincel = +b.dataset.pincel; pintarMalla(); } });
  $('di-malla-subir').onclick = () => cambiarZona(v => v + 1);
  $('di-malla-bajar').onclick = () => cambiarZona(v => v - 1);
  $('di-malla-alto').oninput = e => { const v = +e.target.value; const s = diseno().sustrato; s.malla = { ...s.malla, cm: s.malla.cm.map((x, i) => puntos.has(i) ? v : x), editada: true }; mallaCambio(false); };
  $('di-malla-alto').onchange = () => guardar();
  $('di-malla-suavizar').onclick = () => {
    const s = diseno().sustrato;
    s.malla = { ...suavizar(s.malla, [...puntos]), editada: true };
    mallaCambio();
    avisar(puntos.size ? 'Zona suavizada.' : 'Todo el sustrato suavizado.');
  };
  $('di-malla-quitar').onclick = () => { puntos = new Set(); pintarArriba(); pintarMalla(); };

  /** Línea del sustrato en la lista de compras (se actualiza al mover la pendiente). */
  function pintarSustratoCompra() {
    const c = sustratoAComprar(datos.acuario, diseno().sustrato);
    $('di-compras-t').textContent = resumenCompras(listaCompras(diseno().objetos, plantas), c);
    $('di-sustrato-compra').innerHTML = `<div><b style="width: 22px">·</b><span style="flex: 1">Sustrato · ${escapar(c.nombre)}<br><span class="sec">${c.frente === c.atras ? `${c.frente} cm parejo` : `${c.frente} cm al frente, ${c.atras} cm atrás`} · ~${Math.round(c.litros)} L${c.kg ? ` (≈${Math.round(c.kg)} kg)` : ''} con 10 % extra</span></span><b class="num" style="text-align: right">${escapar(c.bolsas)}</b></div>`;
  }
  $('di-sustratos').addEventListener('click', e => {
    const b = e.target.closest('[data-sustrato]'); if (!b) return;
    datos.acuario.sustrato = b.dataset.sustrato;
    guardar(); pintarDisenador();
  });
  // Atajos del sustrato: rehacen la malla. Las plantas y rocas se apoyan en la nueva altura.
  $('di-pendiente').oninput = e => {
    const s = diseno().sustrato, atras = +e.target.value;
    if (!aplicarAtajo({ atras, perfil: atras && s.perfil === 'parejo' ? 'plano' : !atras ? 'parejo' : s.perfil })) return;
    mallaCambio(false);
  };
  $('di-pendiente').onchange = () => { guardar(); pintarDisenador(); };
  $('di-frente-alto').oninput = e => {
    if (!aplicarAtajo({ frente: +e.target.value })) return;
    mallaCambio(false);
  };
  $('di-frente-alto').onchange = () => { guardar(); pintarDisenador(); };
  $('di-perfiles').addEventListener('click', e => {
    const b = e.target.closest('[data-perfil]'); if (!b) return;
    const s = diseno().sustrato, perfil = b.dataset.perfil;
    // Si estaba parejo, darle una forma visible.
    if (!aplicarAtajo({ perfil, atras: perfil === 'parejo' ? s.atras : s.atras || 6 })) return;
    guardar(); pintarDisenador();
  });
  $('di-plantillas').innerHTML = PLANTILLAS.map(x =>
    `<button type="button" class="chip planta" data-plantilla="${x.id}" title="${escapar(x.nota)}">${escapar(x.nombre)}</button>`).join('');
  $('di-plantillas').addEventListener('click', e => {
    const b = e.target.closest('[data-plantilla]'); if (!b) return;
    const d = diseno(), x = PLANTILLAS.find(z => z.id === b.dataset.plantilla);
    if (d.objetos.length && !confirm(`¿Reemplazar tu diseño por el estilo ${x.nombre}? (${x.nota})`)) return;
    d.objetos = plantilla(x.id, seleccion().selP, datos.acuario, plantas); elegir(null);
    // Natural con tronco: la alfombra sigue la pendiente (si el sustrato está plano y no se le dio forma a mano).
    if (x.id === 'natural' && !d.sustrato.malla?.editada && (d.sustrato.atras || 0) < 4) aplicarAtajo({ perfil: 'plano', atras: 6 });
    guardar(); pintarDisenador();
    const agregadas = [...new Set(d.objetos.filter(o => o.planta && !datos.plantas.includes(o.planta)).map(o => plantas.find(p => p.id === o.planta)?.nombre))].filter(Boolean);
    avisar(`Estilo ${x.nombre} aplicado con tus plantas. Muévelo a tu gusto.` +
      (agregadas.length ? ` Para lograrlo agregué ${agregadas.join(', ')}: cámbialas por las tuyas si no las tienes.` : ''));
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
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    pintarAcuario(); mostrarPestana('t-acuario');
  };
  $('di-copiar').onclick = async () => {
    const c = listaCompras(diseno().objetos, plantas), a = datos.acuario;
    const texto = [`Lista para ${a.nombre} (${a.largo}×${a.ancho}×${a.alto} cm) · cantidades aproximadas`,
      ...c.plantas.map(x => `- ${x.nombre}: ${x.cantidad} ${x.unidad}`),
      ...c.hardscape.map(x => `- ${x.nombre}: ${x.cantidad} ${x.unidad} ${x.detalle}`),
      `- ${sustratoAComprar(a, diseno().sustrato).texto}`].join('\n');
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
    $('ac-medidas').textContent = `${a.largo} × ${a.ancho} × ${a.alto} cm · ${litros(a)} L · ${TIPOS[a.tipo]} · ${SUSTRATOS[tipoSustrato(a)].nombre}`;
    const dias = Math.floor((new Date(hoyISO()) - new Date(a.fecha)) / DIA);
    $('ac-montaje').textContent = dias <= 0 ? 'Montado hoy · semana 1 de arranque'
      : `Montado hace ${dias} días · semana ${Math.floor(dias / 7) + 1}`;

    const { selP, selH } = seleccion();
    dibujar('ac-dibujo', obtenerColores());
    $('ac-plantas').innerHTML = selP.map(p => `<span class="chip planta" aria-pressed="true" style="display:inline-flex;align-items:center">${escapar(p.nombre)}</span>`).join('')
      || '<span class="sec">Sin plantas registradas.</span>';
    $('ac-habitantes').textContent = selH.map(x => `${x.cantidad} ${x.especie.nombre}`).join(' · ') || 'Ninguno registrado.';

    const r = selP.length ? recomendar(selP, selH.map(x => x.especie), { co2: a.tipo === 'co2', nuevo: false, sustrato: tipoSustrato(a), dias }) : null;
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
        <span class="sec">${[r.abonado.metodo, `Cambio de agua: ${r.abonado.cambioAgua}`, r.abonado.sustrato, r.abonado.extra].filter(Boolean).map(escapar).join('<br>')}</span></div>` : ''}
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
  detectarVariantes();

  /**
   * Formas de cada roca o tronco: busca roca-dragon-2.png, -3.png… en app/img/paisaje/.
   * Así una forma nueva aparece sola, sin tocar el código (solo hay que guardarla con ese nombre).
   */
  async function detectarVariantes() {
    const existe = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = src; });
    let cambio = false;
    await Promise.all(PAISAJE.map(async pa => {
      let n = 1;
      while (n < 9 && await existe(`img/paisaje/${pa.id}-${n + 1}.png`)) n++;
      if (n !== (pa.variantes || 1)) { pa.variantes = n; cambio = true; }
    }));
    if (cambio) { pintarAcuario(); if (!$('disenador').hidden) pintarDisenador(); }
  }
  return { registrado: () => !!datos.acuario, abrirRegistro, mostrarBienvenida, dibujar, anotar: texto => { datos.bitacora.unshift({ id: Date.now(), tipo: 'nota', fecha: Date.now(), detalle: texto }); guardar(); pintarBitacora(); } };
}

/**
 * Dibuja la vista frontal (ya armada en el DOM) en un PNG: fondo, arena, sombras e imágenes en su orden de capas,
 * con giro y volteo, y al final la luz de la lámpara. Lo que falta (marcadores) no se dibuja.
 */
async function imagenDeVista(vista) {
  const W = vista.clientWidth, H = vista.clientHeight, k = Math.min(8, Math.max(2, 2400 / W)); // ~2400 px de ancho aunque la pantalla sea chica
  const c = Object.assign(document.createElement('canvas'), { width: W * k, height: H * k });
  const ctx = c.getContext('2d'); ctx.scale(k, k); ctx.imageSmoothingQuality = 'high';
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16262C'); g.addColorStop(1, '#0D1A1F');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const arena = vista.querySelector('.sustrato'), za = +getComputedStyle(arena).zIndex;
  const piezas = [...vista.querySelectorAll('img[data-o], .sombra')].map((el, i) => ({ el, i, z: +getComputedStyle(el).zIndex || 0 }));
  piezas.push({ arena: true, z: za, i: -1 });
  piezas.sort((a, b) => a.z - b.z || a.i - b.i);
  await Promise.all(piezas.filter(p => p.el?.tagName === 'IMG').map(p => p.el.decode().catch(() => {})));
  const olas = await Promise.all(OLAS.map(u => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = u; })));
  for (const p of piezas) {
    if (p.arena) {
      const borde = (arena.dataset.borde || '0 78.5,100 78.5').split(',').map(p => p.split(' ').map(Number));
      const top = Math.min(...borde.map(p => p[1])) / 100 * H;
      const t = SUSTRATOS[arena.dataset.tipo] || SUSTRATOS.aquasoil;
      g = ctx.createLinearGradient(0, top, 0, H); t.colores.forEach((col, i) => g.addColorStop([0, 0.35, 1][i], col));
      ctx.save(); ctx.beginPath(); borde.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x / 100 * W, y / 100 * H));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.clip();
      // La foto del sustrato (como en pantalla: alta como la franja, repetida a lo largo, más oscura al frente);
      // si no carga, los mismos granitos que en pantalla.
      const foto = t.textura && await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = t.textura; });
      if (foto) {
        const alto = TEXTURA_CM / (+arena.dataset.alto || 45) * H, ancho = foto.naturalWidth * alto / foto.naturalHeight;
        for (let y = H - alto; y > top - alto; y -= alto) for (let x = 0; x < W; x += ancho) ctx.drawImage(foto, x, y, ancho, alto);
        g = ctx.createLinearGradient(0, top, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
        ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
      } else for (const [x, y, r, color] of granos(arena.dataset.tipo, W, H - top)) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, top + y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore(); continue;
    }
    const el = p.el, x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
    if (el.classList.contains('sombra')) {
      ctx.save(); ctx.globalAlpha = +(el.style.opacity || 1); ctx.translate(x + w / 2, y + h / 2); ctx.scale(w / 2, h / 2);
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore(); continue;
    }
    if (!el.naturalWidth) continue;
    const alf = el.classList.contains('alf');
    const s = Math.min(w / el.naturalWidth, h / el.naturalHeight), dw = alf ? w : el.naturalWidth * s, dh = alf ? h : el.naturalHeight * s;
    let fuente = el;
    if (alf) { // alfombra: la misma máscara que en pantalla (borde ondulado arriba, lados suaves)
      fuente = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(dw * k)), height: Math.max(1, Math.round(dh * k)) });
      const m = fuente.getContext('2d'), { width: mw, height: mh } = fuente;
      m.drawImage(el, 0, 0, mw, mh);
      m.globalCompositeOperation = 'destination-in';
      if (olas[+el.dataset.ola]) m.drawImage(olas[+el.dataset.ola], 0, 0, mw, mh);
      const lados = m.createLinearGradient(0, 0, mw, 0);
      lados.addColorStop(0, 'rgba(0,0,0,0)'); lados.addColorStop(0.14, '#000'); lados.addColorStop(0.86, '#000'); lados.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = lados; m.fillRect(0, 0, mw, mh);
    }
    ctx.save();
    const filtro = el.style.getPropertyValue('--f').trim(); if (filtro) ctx.filter = filtro; // color de la planta y profundidad
    ctx.translate(x + w / 2, y + h);                                   // base de la imagen
    ctx.rotate((parseFloat(el.style.rotate) || 0) * Math.PI / 180);
    if (el.style.transform.includes('scaleX(-1)')) ctx.scale(-1, 1);
    ctx.drawImage(fuente, -dw / 2, -dh, dw, dh);
    ctx.restore();
  }
  // El resplandor de arriba (como .haz en pantalla) y, al final, la luz de la lámpara: la misma matriz que el filtro de la pantalla.
  const haz = +(vista.querySelector('.haz')?.style.opacity || 0);
  if (haz) {
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = haz;
    g = ctx.createLinearGradient(0, 0, 0, H * 0.75); g.addColorStop(0, 'rgba(255,246,230,.4)'); g.addColorStop(1, 'rgba(255,246,230,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  const final = c, f = ctx;
  const m = (vista.dataset.luz || '').split(' ').map(Number);
  if (m.length === 20) {
    f.setTransform(1, 0, 0, 1, 0, 0);
    const datosPx = f.getImageData(0, 0, c.width, c.height);
    aplicarMatriz(datosPx.data, m); f.putImageData(datosPx, 0, 0);
  }
  return new Promise((ok, mal) => final.toBlob(b => b ? ok(b) : mal(new Error('sin imagen')), 'image/png'));
}
