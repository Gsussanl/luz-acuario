// Diseñador del acuario: vista frontal armada con imágenes PNG (app/img/plantas/<id>.png, app/img/paisaje/<id>.png;
// nombres en PROMPTS-IMAGENES.md). Cada planta, roca o tronco es un objeto con posición libre.
//
// Modelo (versión 3): { version: 3, objetos: [{ id, planta | paisaje, x, b, escala, espejo, v, sobre? }], sustrato }
//   x = centro horizontal (% del largo).
//   b = profundidad, como la altura del piso del acuario en la vista: ARENA[0] = vidrio de atrás, ARENA[1] = vidrio del frente.
//   Todo se apoya en la arena: en pantalla su base queda a la altura real del sustrato en ese punto (alturaSustrato).
//   sobre = { id, x, y, z }: planta unida a una roca o tronco (x: −50 a 50 % de su ancho; y: 0 base a 100 punta; z: −1 detrás, 0 encima, 1 delante).
// Versión 2 (b de 78 a 95 y "encima" si b < 78) se convierte con aV3. El modelo por celdas se migra con celdasAObjetos.

export const PLANOS = ['fondo', 'medio', 'frente'];
export const PAISAJE = [
  { id: 'roca-seiryu', nombre: 'Roca Seiryu', alto: 14, ancho: 1.3 },
  { id: 'roca-dragon', nombre: 'Roca Dragon', alto: 14, ancho: 1.3, variantes: 3 },
  { id: 'roca-pagoda', nombre: 'Roca Pagoda', alto: 16, ancho: 1.2 },
  { id: 'roca-negra', nombre: 'Roca negra', alto: 12, ancho: 1.3, variantes: 2 },
  { id: 'roca-elefante', nombre: 'Roca piel de elefante', alto: 14, ancho: 1.3 },
  { id: 'tronco-spider', nombre: 'Tronco Spider', alto: 28, ancho: 1.6 },
  { id: 'tronco-dragon', nombre: 'Tronco leño', alto: 30, ancho: 2.2 },
  { id: 'tronco-manzanita', nombre: 'Tronco Manzanita', alto: 30, ancho: 1.8 },
  { id: 'tronco-raiz', nombre: 'Tronco raíz', alto: 26, ancho: 1.4 },
];
// Variantes: <id>.png, <id>-2.png, <id>-3.png… Cada roca usa la suya para que no se vean clonadas.
export const archivoPaisaje = (pa, v = 0) => {
  const n = v % (pa.variantes || 1);
  return `img/paisaje/${pa.id}${n ? `-${n + 1}` : ''}.png`;
};
// Profundidad: el piso del acuario se ve en 94 % de la vista al fondo y en 100 % al frente (perspectiva chica).
export const ARENA = [94, 100];
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
/** Profundidad 0 (atrás) a 1 (frente) desde b, y al revés. */
export const profundidad = b => limitar((b - ARENA[0]) / (ARENA[1] - ARENA[0]), 0, 1);
export const bDe = d => ARENA[0] + limitar(d, 0, 1) * (ARENA[1] - ARENA[0]);
// Dónde apoya cada plano (profundidad 0.12, 0.41, 0.76).
export const BASE = { fondo: bDe(0.12), medio: bDe(0.41), frente: bDe(0.76) };
// Modelo anterior (versión 2): solo para convertir diseños guardados y armar plantillas.
const V2 = { ARENA: [78, 95], BASE: { fondo: 80, medio: 85, frente: 91 } };
const perspectivaV2 = b => 1 - 0.15 * limitar((b - 78) / 15, 0, 1);

export const seccionesPara = largo => Math.min(6, Math.max(3, Math.round(largo / 20)));
export const clave = (plano, i) => `${plano}-${i}`;
const escapar = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
export const esAlfombra = p => p.zona === 'primer' || p.zona === 'flotante';
/** Alfombra real (Cuba, Monte Carlo…): se dibuja como tapiz. Las de primer plano con forma "mata" (Staurogyne…) se dibujan como matas. */
export const esTapiz = p => p.forma ? p.forma === 'tapiz' : p.zona === 'primer';
/** Plano según la profundidad: sirve para avisos, autocompletar y el ancho de las copias. */
export const planoDe = b => { const d = profundidad(b); return d < 0.265 ? 'fondo' : d < 0.59 ? 'medio' : 'frente'; };
/** Perspectiva: lo de adelante se ve un poco más chico (1 al fondo, 0.85 al frente). */
const perspectiva = b => 1 - 0.15 * limitar(profundidad(b) * 17 / 15, 0, 1);

/** Llena la cuadrícula según la zona de cada planta: tallos atrás, arbustos al medio, alfombras al frente, epífitas en un tronco. */
export function autocompletar(plantas, secciones) {
  const celdas = {};
  const zonaAPlano = { fondo: 'fondo', medio: 'medio', primer: 'frente' };
  for (const plano of PLANOS) {
    const lista = plantas.filter(p => zonaAPlano[p.zona] === plano);
    if (!lista.length) continue;
    for (let i = 0; i < secciones; i++) celdas[clave(plano, i)] = { planta: lista[i % lista.length].id };
  }
  const epifitas = plantas.filter(p => p.zona === 'epifita');
  if (epifitas.length) {
    const centro = Math.floor(secciones / 2);
    epifitas.forEach((p, j) => {
      const i = Math.min(secciones - 1, centro + j - Math.floor(epifitas.length / 2));
      celdas[clave('medio', i)] = { paisaje: j % 2 ? 'roca-seiryu' : 'tronco-spider', planta: p.id };
    });
  }
  return celdas;
}

let contador = 0;
export const nuevoId = () => `o${Date.now().toString(36)}${(contador++).toString(36)}`;

/** Migra el diseño por celdas a objetos libres, en el mismo lugar donde se veían. */
export function celdasAObjetos(celdas, secciones, catalogo, alto = 45, largo = 100) {
  const objetos = []; // se arma en unidades de la versión 2 y se convierte al final
  for (const plano of PLANOS) for (let i = 0; i < secciones; i++) {
    const c = celdas[clave(plano, i)]; if (!c) continue;
    const r = azar(`${plano}-${i}`);
    const x = (i + 0.5) * 100 / secciones + (r() - 0.5) * 3, b = V2.BASE[plano];
    const pa = PAISAJE.find(z => z.id === c.paisaje);
    if (pa) objetos.push({ id: nuevoId(), paisaje: pa.id, x, b, escala: 1, espejo: false, v: i + PLANOS.indexOf(plano) });
    const p = catalogo.find(z => z.id === c.planta); if (!p) continue;
    // Epífita sobre roca o tronco: su base sube (queda encima); una alfombra queda delante de la base de la roca.
    const sobre = pa && !esAlfombra(p) ? pa.alto / alto * 100 * perspectivaV2(b) * 0.6 : 0;
    objetos.push({ id: nuevoId(), planta: p.id, x, b: b - sobre + (pa && esAlfombra(p) ? 0.5 : 0), escala: 1, espejo: false });
  }
  return aV3(objetos, { largo, alto });
}

/** ¿La base de la planta (versión 2) cae dentro de la roca o tronco? Así se detectaba lo "montado" antes. */
function montadoV2(o, base, largo, alto) {
  const pa = PAISAJE.find(x => x.id === base.paisaje); if (!pa) return false;
  const w = 2000 / largo * pa.ancho * (base.escala || 1);
  const h = Math.min(80, pa.alto / alto * 100 * perspectivaV2(base.b) * (base.escala || 1));
  return o.planta && o.b < V2.ARENA[0] && Math.abs(o.x - base.x) <= w / 2 && o.b <= base.b && o.b >= base.b - h;
}
/**
 * Convierte objetos de la versión 2 a la 3: la misma profundidad relativa en la arena nueva, y las plantas que estaban
 * encima de una roca o tronco pasan a estar unidas a él (sobre) en el mismo punto. Lo que flotaba en el agua baja a la arena.
 */
export function aV3(objetos, { largo = 100, alto = 45 } = {}) {
  const rocas = objetos.filter(o => o.paisaje);
  return objetos.map(o => {
    if (o.sobre) return { ...o };
    const n = { ...o, b: bDe((o.b - V2.ARENA[0]) / (V2.ARENA[1] - V2.ARENA[0])) };
    if (!o.planta || o.b >= V2.ARENA[0]) return n;
    const soportes = rocas.filter(r => montadoV2(o, r, largo, alto)).sort((a, b) => (a.b - o.b) - (b.b - o.b));
    const r = soportes[0]; if (!r) return { ...n, b: bDe(0.06) };
    const pa = PAISAJE.find(x => x.id === r.paisaje), esc = r.escala || 1;
    const wCm = 20 * pa.ancho * esc, hCm = Math.min(80, pa.alto / alto * 100 * perspectivaV2(r.b) * esc) / 100 * alto;
    // Desde la base de la roca, en cm (y hacia abajo), deshaciendo su giro y su volteo.
    const dx = (o.x - r.x) / 100 * largo, dy = (o.b - r.b) / 100 * alto, a = -(r.rot || 0) * Math.PI / 180;
    let lx = dx * Math.cos(a) - dy * Math.sin(a); const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (r.espejo) lx = -lx;
    return { ...n, b: bDe((r.b - V2.ARENA[0]) / (V2.ARENA[1] - V2.ARENA[0])), sobre: { id: r.id, x: Math.round(limitar(lx / wCm * 100, -50, 50)), y: Math.round(limitar(-ly / hCm * 100, 0, 100)), z: 0 } };
  });
}

/** Diseño como objetos, venga del modelo nuevo, de la versión 2 o del de celdas. */
export const objetosDe = (diseno, catalogo, alto, largo = 100) =>
  diseno?.objetos ? (diseno.version >= 3 ? diseno.objetos : aV3(diseno.objetos, { largo, alto }))
    : diseno?.celdas ? celdasAObjetos(diseno.celdas, diseno.secciones || 5, catalogo, alto, largo) : [];
/** Roca o tronco al que está unida una planta (si existe). */
export const soporteDe = (o, objetos) => o?.sobre ? objetos.find(z => z.id === o.sobre.id && z.paisaje) : null;
/** Profundidad (b) con la que cuenta un objeto: la de su roca si está unido. */
export const bEfectiva = (o, objetos) => soporteDe(o, objetos)?.b ?? o.b;

/** Dónde aparece algo nuevo: en su plano natural, en el centro. */
export function posicionInicial(item, catalogo) {
  const p = item.planta && catalogo.find(z => z.id === item.planta);
  const plano = p ? ({ fondo: 'fondo', medio: 'medio', primer: 'frente', flotante: 'frente' }[p.zona] || 'medio') : 'medio';
  return { x: 50, b: BASE[plano] };
}

/** Número de cada especie de atrás hacia adelante (para la leyenda). */
export function numerar(objetos) {
  const orden = [];
  const prof = o => bEfectiva(o, objetos); // lo unido a una roca cuenta con la profundidad de la roca
  for (const o of [...objetos].sort((a, b) => prof(a) - prof(b) || a.x - b.x)) if (o.planta && !orden.includes(o.planta)) orden.push(o.planta);
  return Object.fromEntries(orden.map((id, i) => [id, i + 1]));
}

/** Avisos de diseño: altura según dónde quedó cada planta. */
export function avisosDiseno(objetos, catalogo, alto) {
  const avisos = new Set();
  for (const o of objetos) {
    const p = catalogo.find(x => x.id === o.planta); if (!p) continue;
    const plano = o.sobre ? 'medio' : planoDe(o.b);
    if (plano === 'frente' && p.altura[1] > alto * 0.35) avisos.add(`${p.nombre} crece hasta ${p.altura[1]} cm: al frente va a tapar lo de atrás.`);
    if (plano === 'fondo' && p.altura[1] <= 5) avisos.add(`${p.nombre} es muy baja para el fondo: no se va a ver.`);
    if (p.zona === 'epifita' && !soporteDe(o, objetos)) avisos.add(`${p.nombre} se amarra a roca o tronco: elígela y toca "Unir a roca o tronco".`);
  }
  return [...avisos];
}

/**
 * Consejos de composición: avisos suaves (no errores), solo cuando aplican. Cada uno: { texto, guia } (guia: ofrece la guía de tercios).
 */
export function consejosComposicion(objetos, catalogo, largo = 100) {
  const consejos = [];
  const piezas = objetos.filter(o => o.paisaje && PAISAJE.some(x => x.id === o.paisaje));
  if (piezas.length === 1 && largo > 60)
    consejos.push({ texto: `Una sola roca o tronco en un acuario de más de 60 cm: prueba 3 o 5, de tamaños distintos, en triángulo.` });
  const tamano = o => { const pa = PAISAJE.find(x => x.id === o.paisaje); return pa.ancho * pa.alto * (o.escala || 1) ** 2; };
  const principal = piezas.reduce((a, o) => !a || tamano(o) > tamano(a) ? o : a, null);
  if (principal && Math.abs(principal.x - 50) < 10)
    consejos.push({ texto: 'Tu pieza principal está al centro: muévela a un tercio del largo para un paisaje más natural.', guia: true });
  const de = o => catalogo.find(x => x.id === o.planta);
  const rojas = new Set(objetos.filter(o => de(o)?.rojo).map(o => o.planta));
  if (rojas.size > 3)
    consejos.push({ texto: `Muchas plantas rojas distintas juntas (${rojas.size}): deja 2 o 3 y pon verdes entre ellas para que resalten.` });
  // Esquinas: qué hay en el cuarto izquierdo y en el derecho (especies, rocas y troncos). Si es casi lo mismo, se ve simétrico.
  const esquina = f => new Set(objetos.filter(o => f(o.sobre ? objetos.find(r => r.id === o.sobre.id)?.x ?? o.x : o.x)).map(o => o.planta || o.paisaje.split('-')[0]));
  const izq = esquina(x => x < 25), der = esquina(x => x > 75);
  const comunes = [...izq].filter(k => der.has(k)).length, todas = new Set([...izq, ...der]).size;
  if (izq.size >= 2 && der.size >= 2 && comunes / todas >= 0.75)
    consejos.push({ texto: 'Las dos esquinas son casi iguales: cambia una para que no se vea simétrico.' });
  const pelonas = new Set(objetos.filter(o => tallosPelones(o, de(o), objetos, catalogo)).map(o => de(o).nombre));
  for (const n of pelonas) consejos.push({ texto: `${n} deja ver abajo sus tallos sin hojas: pon delante una planta media (Alternanthera, Cryptocoryne…) o una roca.` });
  return consejos;
}

/**
 * ¿Una planta de tallo del fondo deja ver sus tallos pelones? Sí, si nada más adelante (planta media o de fondo,
 * epífita, roca o tronco) la tapa abajo: a menos de ~14 % del largo de lado y al menos un poco más al frente.
 */
export function tallosPelones(o, p, objetos, catalogo) {
  if (!p?.tallo || o.sobre || planoDe(o.b) !== 'fondo') return false;
  const d = profundidad(o.b);
  const xDe = q => { const r = q.sobre && objetos.find(z => z.id === q.sobre.id); return r ? r.x : q.x; };
  return !objetos.some(q => {
    if (q === o) return false;
    const r = q.sobre && objetos.find(z => z.id === q.sobre.id);
    if (profundidad((r || q).b) < d + 0.08 || Math.abs(xDe(q) - o.x) > 14) return false;
    if (q.paisaje) return true;
    const pq = catalogo.find(x => x.id === q.planta);
    return !!pq && !esAlfombra(pq) && pq.altura[1] >= 8;
  });
}

/** Color de la luz en el agua a partir de los 4 canales (solo visual). */
export function colorDeLuz([r, g, b, u]) {
  const c = v => Math.min(255, Math.round(v));
  return `rgb(${c(r * 2.3 + u * 0.6 + 25)}, ${c(g * 2.3 + 25)}, ${c(b * 2.3 + u * 1.2 + 25)})`;
}

/*
 * Luz realista: cada LED ilumina con su color real (rojo ~630 nm, verde ~520 nm, azul ~450 nm, UV ~400 nm) y cada
 * canal de la imagen se multiplica por la luz que le llega, como el color de una hoja bajo esa lámpara:
 * sin rojo, las plantas rojas se apagan; con mucho azul, todo azulado. El UV agrega algo de violeta y realza rojos y rosas.
 */
const LED = [[1, 0.1, 0.02], [0.1, 1, 0.3], [0.04, 0.25, 1], [0.22, 0, 0.42]]; // cuánto da cada LED en R, G, B de la imagen (UV es tenue)
const luzDe = cs => [0, 1, 2].map(k => cs.reduce((t, v, i) => t + v * LED[i][k], 0));
const forma = l => l.map(v => v / l[1]);
// Blanco de referencia: entre "Crecimiento" (80/70/60/30) y los cuatro parejos, para que los dos se vean neutros.
const BLANCO = (() => { const a = forma(luzDe([0.8, 0.7, 0.6, 0.3])), b = forma(luzDe([1, 1, 1, 1])); return a.map((v, k) => Math.sqrt(v * b[k])); })();
const NOCHE = [0.45, 0.6, 1];                     // con la lámpara apagada: luz de luna azulada y tenue

/**
 * Matriz de feColorMatrix (4×5, 20 números) para la luz de la lámpara con los canales [rojo, verde, azul, UV] en %.
 * Brillo total según el canal más alto (como antes); en 0 % queda de noche, no negro.
 */
export function matrizLuz(colores) {
  const cs = [0, 1, 2, 3].map(i => Math.max(0, Math.min(100, colores[i] || 0)) / 100);
  const intensidad = Math.max(...cs);
  const brillo = 0.22 + 0.85 * Math.min(1, intensidad * 1.3);
  const l = luzDe(cs).map((v, k) => v / BLANCO[k]), alto = Math.max(...l) || 1;
  const w = Math.min(1, intensidad / 0.15);         // poca luz: se va mezclando con la de noche
  const g = l.map((v, k) => +(brillo * (w * v / alto + (1 - w) * NOCHE[k])).toFixed(3));
  const uv = +(cs[3] * 0.03).toFixed(3);              // un velo violeta muy leve
  return [g[0], 0, 0, 0, uv, 0, g[1], 0, 0, 0, 0, 0, g[2], 0, uv, 0, 0, 0, 1, 0];
}

/** Aplica la matriz de luz a los píxeles (para "Guardar imagen", igual que el filtro de la pantalla). */
export function aplicarMatriz(px, m) {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3] / 255;
    px[i] = m[0] * r + m[1] * g + m[2] * b + m[4] * 255;
    px[i + 1] = m[5] * r + m[6] * g + m[7] * b + m[9] * 255;
    px[i + 2] = m[10] * r + m[11] * g + m[12] * b + m[14] * 255;
    px[i + 3] = (m[18] * a + m[19]) * 255;
  }
  return px;
}
let luzN = 0; const LUZ_ID = `luz-${Math.random().toString(36).slice(2, 7)}`; // único aunque haya varias vistas en la página

// Azar fijo: el mismo diseño se ve siempre igual, pero cada mata distinta.
function azar(semilla) {
  let s = [...semilla].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Varias copias de la misma imagen para que una mata se vea tupida y natural, no como una fila de matas iguales:
 * alturas distintas, algunas en espejo, desplazadas y encimadas. Las más altas van atrás.
 * Las alfombras se reparten a lo ancho para cubrir sin huecos.
 */
export function copiasVariadas(planta, plano, semilla, centro, anchoSec, cuantas) {
  const r = azar(semilla + planta.id);
  const tapiz = esTapiz(planta), alfombra = tapiz || planta.zona === 'flotante', mata = planta.forma === 'mata';
  const n = cuantas || (alfombra || mata ? 3 : plano === 'fondo' ? 4 : 3); // el usuario puede elegir de 1 a 8
  const copias = Array.from({ length: n }, (_, k) => {
    if (mata) return { // grupito: plantas más angostas, poco separadas, cada una se distingue
      dx: anchoSec * ((k - (n - 1) / 2) * 0.5 + (r() - 0.5) * 0.06), w: anchoSec * (0.55 + r() * 0.15), f: 0.8 + r() * 0.25, espejo: r() < 0.5 };
    const dx = tapiz
      ? anchoSec * ((k - (n - 1) / 2) * 0.34 + (r() - 0.5) * 0.1)  // alfombra: bien encimadas, que no se vea la repetición
      : alfombra
      ? anchoSec * ((k - (n - 1) / 2) * 0.42 + (r() - 0.5) * 0.08)
      : anchoSec * ((k - (n - 1) / 2) * 0.27 + (r() - 0.5) * 0.16);
    const c = {
      dx,
      // Las del fondo se enciman con la zona vecina: así crecen más altas y forman un macizo como en un acuario real.
      w: anchoSec * (alfombra ? 0.8 + r() * 0.15 : plano === 'fondo' ? 0.95 + r() * 0.45 : 0.7 + r() * 0.35),
      f: tapiz ? 0.8 + r() * 0.3 : alfombra ? 1 : 0.78 + r() * 0.27, // alfombra 80–110 %; matas 78–105 % de la altura de la especie
      espejo: r() < 0.5,
    };
    if (tapiz) { c.ola = Math.floor(r() * OLAS.length); c.dy = r() * 0.5; } // forma del borde de arriba y un poco más abajo o arriba
    return c;
  });
  return copias.sort((a, b) => b.f - a.f);           // más alta primero = queda atrás
}

/**
 * Borde de arriba de las alfombras: ondulado, irregular y difuminado (máscara). Tres formas distintas para que no se repita.
 * En pantalla van como mask-image (variables --ola0…) y en "Guardar imagen" se aplican igual en el canvas.
 */
export const OLAS = [0, 1, 2].map(k => {
  const r = azar(`ola${k}`), pts = [];
  for (let x = 0; x <= 100; x += 7 + r() * 6) pts.push([x, 3 + r() * 11]);
  pts.push([100, 3 + r() * 11]);
  let d = `M0 100L0 ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) { // curvas suaves por los puntos medios
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    d += `Q${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
  }
  d += `L100 ${pts.at(-1)[1].toFixed(1)}L100 100Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="15">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><path d="${d}" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
});

function imagen(ruta, nombre, color, estilo, id, ola) {
  // Si falta el PNG se muestra un marcador con el nombre: así se sabe qué imagen falta.
  const alf = ola === undefined ? '' : ` class="alf" data-ola="${ola}"`;
  return `<img src="${ruta}" alt="" loading="lazy" draggable="false"${alf} style="${estilo}" data-o="${id}" data-nombre="${escapar(nombre)}" data-color="${color}"
    onerror="const d=document.createElement('div');d.className='falta-img';d.textContent=this.dataset.nombre;d.setAttribute('style',this.getAttribute('style')+';--c:'+this.dataset.color);d.dataset.o=this.dataset.o;this.replaceWith(d)">`;
}

/**
 * Color de cada cosa como filtro CSS: lo que el usuario eligió (Color = saturación 50–150 %, Brillo 60–120 %, Tono −20° a +20°)
 * y, si la profundidad está encendida, lo de atrás un poco más oscuro y menos saturado (hasta −12 % brillo y −15 % color al fondo).
 * d: 0 = atrás, 1 = frente. Devuelve '' si no cambia nada.
 */
export function filtroColor(color, d, conProfundidad = true) {
  const atras = conProfundidad ? 1 - limitar(d, 0, 1) : 0;
  const sat = limitar(color?.sat ?? 100, 50, 150) / 100 * (1 - 0.15 * atras);
  const brillo = limitar(color?.brillo ?? 100, 60, 120) / 100 * (1 - 0.12 * atras);
  const tono = limitar(color?.tono ?? 0, -20, 20);
  const f = [];
  if (Math.abs(sat - 1) > 0.004) f.push(`saturate(${sat.toFixed(3)})`);
  if (Math.abs(brillo - 1) > 0.004) f.push(`brightness(${brillo.toFixed(3)})`);
  if (tono) f.push(`hue-rotate(${tono}deg)`);
  return f.join(' ');
}
const conFiltro = (estilo, f) => f ? `${estilo};--f:${f}` : estilo;

/** Alfombras: profundidades extra (hacia el frente) donde se repiten sus copias para cubrir el piso. */
const FILAS_ALFOMBRA = [0, 0.06, 0.12];
/** Orden de dibujo: lo de más adelante va delante. A la misma profundidad: plantas detrás, rocas y troncos delante, alfombras delante de la base de la roca. */
const capa = (b, extra = 0) => Math.max(3, 10 + Math.round(profundidad(b) * 1000) + extra);

/** Giro y volteo como CSS: el giro es alrededor de la base (la planta o el tronco "pivotean" en la arena). */
const giro = (rot, espejo) => (rot ? `;rotate:${rot}deg;transform-origin:50% 100%` : '') + (espejo ? ';transform:scaleX(-1)' : '');
/** Sombra suave en la base (y = dónde apoya, % desde arriba): integra lo que está sobre la arena. */
const sombra = (x, w, y, z, id) =>
  `<div class="sombra" data-s="${id}" style="left:${x - w / 2}%;width:${w}%;bottom:${100 - y - 1.4}%;height:3%;z-index:${z - 1}"></div>`;

// ---------- Forma del sustrato: malla de alturas en cm ----------
/** Atajos que llenan la malla. "plano" es la pendiente pareja de atrás hacia adelante (id de los diseños guardados). */
export const PERFILES = [
  { id: 'parejo', nombre: 'Parejo' },
  { id: 'plano', nombre: 'Pendiente' },
  { id: 'izquierda', nombre: 'Sube a la izquierda' },
  { id: 'derecha', nombre: 'Sube a la derecha' },
  { id: 'centro', nombre: 'Montículo al centro' },
  { id: 'valle', nombre: 'Valle al centro' },
];
/** Cuánto más alto está el sustrato en x según el perfil (1 = la altura elegida). */
const perfil = (id, x) => id === 'izquierda' ? 1.6 - 1.2 * x / 100 : id === 'derecha' ? 0.4 + 1.2 * x / 100
  : id === 'centro' ? 0.3 + 1.1 * (1 - Math.abs(x - 50) / 50) : id === 'valle' ? 0.3 + 1.1 * Math.abs(x - 50) / 50
  : id === 'parejo' ? 0 : 1;
/** Malla: 12 puntos a lo largo × 6 de fondo (fila 0 = atrás). Mínimo 2 cm; máximo 60 % del alto del acuario. */
export const MALLA = { cols: 12, filas: 6 };
export const ALTO_MIN = 2;
export const altoMax = (alto = 45) => Math.round(alto * 0.6);
export const ALTO_AVISO = 15; // más alto que esto se compacta
const redondear1 = v => Math.round(v * 10) / 10;
/** Llena la malla desde un atajo: altura al frente, cuánto más alto atrás y forma a lo largo. */
export function mallaDesde({ frente = 3, atras = 0, perfil: id = 'plano' } = {}, alto = 45) {
  const { cols, filas } = MALLA, cm = [];
  for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++)
    cm.push(redondear1(limitar(frente + atras * perfil(id, c / (cols - 1) * 100) * (1 - f / (filas - 1)), ALTO_MIN, altoMax(alto))));
  return { cols, filas, cm };
}
/** Suaviza la malla (promedio con los vecinos) en los puntos dados (todos si no se dan): sin escalones. */
export function suavizar(malla, puntos) {
  const { cols, filas, cm } = malla, nuevo = [...cm];
  for (const i of puntos?.length ? puntos : cm.map((_, k) => k)) {
    const f = Math.floor(i / cols), c = i % cols; let s = 0, n = 0;
    for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
      const ff = f + df, cc = c + dc; if (ff < 0 || ff >= filas || cc < 0 || cc >= cols) continue;
      const peso = df || dc ? 1 : 2; s += cm[ff * cols + cc] * peso; n += peso;
    }
    nuevo[i] = redondear1(s / n);
  }
  return { ...malla, cm: nuevo };
}
/** Lo más alto del sustrato (cm). */
export const sustratoMasAlto = s => s?.malla ? Math.max(...s.malla.cm)
  : Math.max(...Array.from({ length: 21 }, (_, i) => alturaSustrato(s, i * 5, 0)));
/** Altura en pantalla (% desde arriba) donde apoya algo que está en x a la profundidad b: la superficie real de la arena. */
export const yArena = (sustrato, x, b, alto = 45) => b - alturaSustrato(sustrato, x, profundidad(b)) / alto * 100;
/** Borde de arriba de la arena vista de frente (lo más alto en cada x), como puntos [x, y] en % de la vista. */
export function bordeSustrato(sustrato, alto = 45) {
  return Array.from({ length: 41 }, (_, i) => {
    const x = i * 2.5; let y = 100;
    for (let k = 0; k <= 20; k++) y = Math.min(y, yArena(sustrato, x, bDe(k / 20), alto));
    return [x, Math.round(Math.max(2, y) * 100) / 100];
  });
}

// ---------- Tipo de sustrato: color en el dibujo y cuánto comprar ----------
/**
 * Cada tipo: nombre, colores de la arena (arriba, medio, abajo) y granitos que se ven encima
 * ([color, radio px, cuántos por cada cuadro de 40×40 px]). Un solo lugar para la pantalla y "Guardar imagen".
 * textura: foto del sustrato (mosaico sin costura que representa TEXTURA_CM de alto) que cubre la arena; si no carga, se ven el degradado y los granitos.
 */
export const SUSTRATOS = {
  aquasoil: { nombre: 'Aquasoil', largo: 'Granulado nutritivo (aquasoil)', colores: ['#1C1713', '#271F19', '#120E0B'],
    granos: [['rgba(120,96,72,.55)', 0.8, 70], ['rgba(0,0,0,.6)', 0.9, 45]], kgPorLitro: 0, textura: 'img/sustrato/aquasoil.jpg' },
  silice: { nombre: 'Arena sílice', largo: 'Arena sílice', colores: ['#D6C8AA', '#C9B996', '#A99779'],
    granos: [['rgba(255,250,235,.3)', 0.5, 40], ['rgba(110,90,60,.2)', 0.5, 30]], kgPorLitro: 1.5, textura: 'img/sustrato/silice.jpg' },
  gravilla: { nombre: 'Gravilla', largo: 'Gravilla', colores: ['#6B6157', '#5A5148', '#3F3832'],
    granos: [['rgba(190,180,165,.6)', 1.9, 9], ['rgba(28,24,20,.6)', 1.7, 9], ['rgba(145,122,98,.65)', 1.5, 11]], kgPorLitro: 1.6, textura: 'img/sustrato/gravilla.jpg' },
};
/** Tipo de sustrato del acuario; si no lo tiene guardado: aquasoil en plantados, gravilla en "solo peces". */
/** Alto real que representa el mosaico de la textura: así los granos miden lo mismo con o sin pendiente. */
export const TEXTURA_CM = 7.5; // alto real que representa la foto (140 px de la franja central)
export const tipoSustrato = acuario => SUSTRATOS[acuario?.sustrato] ? acuario.sustrato : acuario?.tipo === 'peces' ? 'gravilla' : 'aquasoil';
/** Granitos al azar (semilla fija: siempre igual) en un cuadro de ancho × alto px: [x, y, radio, color]. */
export function granos(tipo, ancho = 40, alto = 40, semilla = 7) {
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  return (SUSTRATOS[tipo] || SUSTRATOS.aquasoil).granos.flatMap(([color, r, n]) =>
    Array.from({ length: Math.round(n * ancho * alto / 1600) }, () => [azar() * ancho, azar() * alto, r * (0.6 + azar() * 0.8), color]));
}
const mosaicos = {};
/**
 * Fondo CSS de la arena: la foto del tipo (granos a escala real según el alto del acuario, más oscura hacia el frente)
 * o, sin foto, un mosaico de granitos (SVG); debajo, el degradado de colores.
 */
export function fondoArena(tipo, tope = 78, alto = 45) {
  const t = SUSTRATOS[tipo] || SUSTRATOS.aquasoil, [a, b, c] = t.colores;
  const degradado = `linear-gradient(${a} ${tope}%,${b} ${tope + (100 - tope) * 0.35}%,${c} 100%)`;
  if (t.textura) return `linear-gradient(transparent ${tope}%,rgba(0,0,0,.35) 100%),url('${t.textura}') left bottom/auto ${(TEXTURA_CM / alto * 100).toFixed(1)}% repeat,${degradado}`;
  mosaicos[tipo] ??= "url('data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">${
    granos(tipo).map(([x, y, r, col]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${col}"/>`).join('')}</svg>`) + "')";
  return `${mosaicos[tipo]} 0 0/40px 40px,${degradado}`;
}

/** Altura del sustrato en cm en x (0–100 % del largo) y profundidad d (0 = atrás, 1 = vidrio del frente). */
// Con malla: interpolación entre sus 4 puntos vecinos. Sin malla (diseños viejos, pruebas): frente + pendiente según el perfil.
export function alturaSustrato(sustrato, x, d) {
  const m = sustrato?.malla;
  if (m && m.cm?.length === m.cols * m.filas) {
    const u = limitar(x, 0, 100) / 100 * (m.cols - 1), v = limitar(d, 0, 1) * (m.filas - 1);
    const c0 = Math.min(m.cols - 2, Math.floor(u)), f0 = Math.min(m.filas - 2, Math.floor(v)), tu = u - c0, tv = v - f0;
    const h = (f, c) => m.cm[f * m.cols + c];
    return (h(f0, c0) * (1 - tu) + h(f0, c0 + 1) * tu) * (1 - tv) + (h(f0 + 1, c0) * (1 - tu) + h(f0 + 1, c0 + 1) * tu) * tv;
  }
  const frente = sustrato?.frente ?? 3;
  return frente + (sustrato?.atras || 0) * perfil(sustrato?.perfil, x) * (1 - d);
}
const BOLSA_KG = 5;
/**
 * Cuánto sustrato comprar: volumen promediando una cuadrícula de 10×10 puntos (sirve con pendiente y cualquier perfil),
 * más 10 % (se asienta y se pierde al acomodar). Las rocas no se descuentan.
 * Aquasoil se vende en bolsas de 3 y 9 L (la combinación que sobre menos y con menos bolsas); sílice y gravilla por kg, en bolsas de 5 kg.
 */
export function sustratoAComprar(acuario, sustrato) {
  const { largo = 100, ancho = 35 } = acuario || {}, N = 10;
  let suma = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) suma += alturaSustrato(sustrato, (i + 0.5) * 100 / N, (j + 0.5) / N);
  const promedio = suma / (N * N);
  const neto = largo * ancho * promedio / 1000, litros = Math.round(neto * 1.1 * 10) / 10;
  const tipo = tipoSustrato(acuario), t = SUSTRATOS[tipo];
  const frente = Math.round(alturaSustrato(sustrato, 50, 1));
  const atras = Math.round(Math.max(...Array.from({ length: 21 }, (_, i) => alturaSustrato(sustrato, i * 5, 0))));
  let bolsas, kg = null;
  if (tipo === 'aquasoil') {
    const de3 = Math.max(1, Math.ceil(litros / 3)), n9 = Math.floor(de3 / 3), n3 = de3 - n9 * 3;
    bolsas = [n9 && `${n9} bolsa${n9 > 1 ? 's' : ''} de 9 L`, n3 && `${n3}${n9 ? '' : ` bolsa${n3 > 1 ? 's' : ''}`} de 3 L`]
      .filter(Boolean).join(' + ') + ` (${de3 * 3} L)`;
  } else {
    kg = Math.round(litros * t.kgPorLitro * 10) / 10;
    const n = Math.max(1, Math.ceil(kg / BOLSA_KG));
    bolsas = `${n} bolsa${n > 1 ? 's' : ''} de ${BOLSA_KG} kg (${n * BOLSA_KG} kg)`;
  }
  const alturas = atras > frente ? `${frente} cm al frente, ${atras} cm atrás` : `${frente} cm parejo`;
  const cantidad = `~${Math.round(litros)} L${kg ? ` (≈${Math.round(kg)} kg)` : ''}`;
  return { tipo, nombre: t.nombre, neto: Math.round(neto * 10) / 10, litros, kg, bolsas, frente, atras,
    texto: `Sustrato · ${t.nombre}: ${cantidad} → ${bolsas} (${alturas})` };
}

/**
 * Dónde va la base de un objeto en la vista: x e y (% de la vista), escala por perspectiva y capa.
 * Sobre la arena: apoyado en la altura real del sustrato en su punto. Unido a una roca o tronco: pegado a ella,
 * siguiendo su posición, giro, volteo y tamaño.
 */
export function apoyo(o, ctx) {
  const { largo = 100, alto = 45, sustrato, objetos = [] } = ctx;
  const r = soporteDe(o, objetos);
  if (!r) return { x: o.x, y: yArena(sustrato, o.x, o.b, alto), esc: perspectiva(o.b), z: capa(o.b), unido: false };
  const pa = PAISAJE.find(z => z.id === r.paisaje), base = apoyo(r, ctx), e = r.escala || 1;
  const wCm = 20 * pa.ancho * e, hCm = Math.min(80, pa.alto / alto * 100 * base.esc * e) / 100 * alto;
  let lx = o.sobre.x / 100 * wCm; const ly = -o.sobre.y / 100 * hCm;
  if (r.espejo) lx = -lx;
  const a = (r.rot || 0) * Math.PI / 180;
  const dx = lx * Math.cos(a) - ly * Math.sin(a), dy = lx * Math.sin(a) + ly * Math.cos(a);
  const zRoca = base.z + 1 + (r.orden || 0) * 30;
  return { x: r.x + dx / largo * 100, y: base.y + dy / alto * 100, esc: base.esc, z: zRoca + ((o.sobre.z || 0) < 0 ? -2 : 2 + Math.max(0, o.sobre.z || 0)), unido: true };
}

/** Al revés que apoyo: un punto de la vista (x, y en %) en coordenadas de la roca (x: −50 a 50 % del ancho, y: 0 base a 100 punta). */
export function sobreDesdePunto(r, px, py, ctx) {
  const { largo = 100, alto = 45 } = ctx;
  const pa = PAISAJE.find(z => z.id === r.paisaje), base = apoyo(r, ctx), e = r.escala || 1;
  const wCm = 20 * pa.ancho * e, hCm = Math.min(80, pa.alto / alto * 100 * base.esc * e) / 100 * alto;
  const dx = (px - base.x) / 100 * largo, dy = (py - base.y) / 100 * alto, a = -(r.rot || 0) * Math.PI / 180;
  let lx = dx * Math.cos(a) - dy * Math.sin(a); const ly = dx * Math.sin(a) + dy * Math.cos(a);
  if (r.espejo) lx = -lx;
  return { x: lx / wCm * 100, y: -ly / hCm * 100 };
}

/** HTML de un objeto (una roca, o varias copias de una planta). ctx: { largo, alto, catalogo, sustrato, objetos }. */
export function dibujarObjeto(o, ctx) {
  const { largo, alto, catalogo } = ctx;
  const anchoSec = 2000 / largo; // una mata ocupa ~20 cm de ancho
  const ap = apoyo(o, ctx);
  const esc = ap.esc * (o.escala || 1);
  const voltear = o.espejo ? -1 : 1;
  const orden = (o.orden || 0) * 30; // "Al frente"/"Atrás": salta unos 3 % de profundidad por toque
  const abajo = 100 - ap.y;
  if (o.paisaje) {
    const pa = PAISAJE.find(x => x.id === o.paisaje); if (!pa) return '';
    const h = Math.min(80, pa.alto / alto * 100 * esc), w = anchoSec * pa.ancho * (o.escala || 1);
    const z = ap.z + 1 + orden;
    // Sombras: suave sobre lo que está justo detrás (volumen), la de la base y una de contacto más marcada.
    const detras = `<div class="sombra" data-s="${o.id}" style="left:${o.x - w * 0.65}%;width:${w * 1.3}%;bottom:${abajo - 1.5}%;height:${h * 1.1}%;z-index:${z - 1};opacity:.55"></div>`;
    const contacto = `<div class="sombra" data-s="${o.id}" style="left:${o.x - w * 0.36}%;width:${w * 0.72}%;bottom:${abajo - 0.7}%;height:1.8%;z-index:${z - 1};opacity:.85"></div>`;
    return detras + sombra(o.x, w * 0.9, ap.y, z, o.id) + contacto + imagen(archivoPaisaje(pa, o.v || 0), pa.nombre, '#7A6A5A',
      conFiltro(`left:${o.x - w / 2}%;width:${w}%;bottom:${abajo}%;height:${h}%;z-index:${z}` + giro(o.rot, voltear < 0), filtroColor(o.color, profundidad(o.b), ctx.profundidad !== false)), o.id);
  }
  const p = catalogo.find(x => x.id === o.planta); if (!p) return '';
  // Alfombras: manda el ancho (cubrir sin islitas); la altura sale de la proporción de la imagen.
  const alfombra = esAlfombra(p), plana = esTapiz(p) || p.zona === 'flotante'; // plana: la altura sale de su imagen
  const h = plana ? 40 : Math.min(85, Math.max(7, p.altura[1] / alto * 100)) * esc;
  const color = p.rojo ? '#C4553F' : '#3E9B58';
  const z = ap.z + (alfombra && !ap.unido ? 2 : 0) + orden;
  if (esTapiz(p) && !ap.unido) {
    // Alfombra o pasto: cada copia apoya en la altura del sustrato en su punto (malla), alto según la proporción de su imagen,
    // con el borde de arriba ondulado y difuminado y los lados suaves (clase "alf"). Una alfombra cubre el piso: se dibuja
    // en tres filas hacia el frente (hasta ~5 cm más adelante), así no queda una franja de tierra entre alfombras.
    const prop = p.proporcion || 0.2, d0 = profundidad(o.b);
    const copias = copiasVariadas(p, 'frente', o.id, ap.x, anchoSec * (o.escala || 1), o.copias);
    return FILAS_ALFOMBRA.filter(fd => d0 + fd <= 1.001).flatMap((fd, i) => copias.map(({ dx, w, f, espejo, ola, dy }, n) => {
      const b = bDe(Math.min(1, d0 + fd)), xc = ap.x + (dx + i % 2 * anchoSec * 0.17) * voltear;
      const yc = Math.min(100, yArena(ctx.sustrato, limitar(xc, 0, 100), b, alto) + dy), fc = f * (1 - 0.07 * i);
      return imagen(`img/plantas/${p.id}.png`, i || n ? '' : p.nombre, color,
        conFiltro(`left:${xc - w / 2}%;width:${w}%;bottom:${100 - yc}%;height:${w * prop * largo / alto * fc}%;z-index:${capa(b, 2) + orden};--m:var(--ola${(ola + i) % OLAS.length})` +
        giro(o.rot, (espejo !== (i % 2 === 1)) !== (voltear < 0)), filtroColor(o.color, profundidad(b), ctx.profundidad !== false)), o.id, (ola + i) % OLAS.length);
    })).join('');
  }
  const filtro = filtroColor(o.color, profundidad((soporteDe(o, ctx.objetos || []) || o).b), ctx.profundidad !== false); // unida: la profundidad de su roca
  return (plana || ap.unido ? '' : sombra(ap.x, anchoSec * (o.escala || 1) * 1.1, ap.y, z, o.id)) +
    copiasVariadas(p, ap.unido ? 'medio' : planoDe(o.b), o.id, ap.x, anchoSec * (o.escala || 1), o.copias).map(({ dx, w, f, espejo }, n) =>
      imagen(`img/plantas/${p.id}.png`, n ? '' : p.nombre, color,
        conFiltro(`left:${ap.x + dx * voltear - w / 2}%;width:${w}%;bottom:${abajo}%;height:${h * f}%;z-index:${z}` +
        giro(o.rot, espejo !== (voltear < 0)), filtro), o.id)).join('');
}

/**
 * Deshacer / rehacer: guarda copias (texto JSON) del diseño antes de cada cambio que se guarda, hasta max.
 * inicio(s): empieza de cero con el diseño actual. cambio(s): anota el diseño nuevo (si cambió). deshacer()/rehacer(): el diseño al que volver, o null.
 */
export function historial(max = 30) {
  let atras = [], adelante = [], actual = null;
  return {
    inicio(s) { atras = []; adelante = []; actual = s; },
    cambio(s) {
      if (s === actual) return false;
      if (actual !== null) { atras.push(actual); if (atras.length > max) atras.shift(); }
      adelante = []; actual = s; return true;
    },
    deshacer() { if (!atras.length) return null; adelante.push(actual); return actual = atras.pop(); },
    rehacer() { if (!adelante.length) return null; atras.push(actual); return actual = adelante.pop(); },
    get puede() { return { deshacer: atras.length > 0, rehacer: adelante.length > 0 }; },
  };
}

/**
 * "Cambiar por…": la misma cosa con otra planta, roca o tronco. Conserva lugar, tamaño, giro, color, plantas en la mata,
 * unión y bloqueo. Una roca o tronco nuevo empieza en su primera forma; una planta que pasa a ser roca deja su mata y unión.
 */
export function sustituir(o, item) {
  const n = { ...o };
  if (item.planta) { n.planta = item.planta; delete n.paisaje; delete n.v; }
  else { n.paisaje = item.paisaje; n.v = 0; delete n.planta; delete n.copias; delete n.sobre; }
  return n;
}

/** Profundidad (0 atrás … 1 frente) que corresponde a tocar el dibujo en (x, y) (en % de la vista): donde la arena está a esa altura. */
export function profundidadDesdeToque(sustrato, x, y, alto = 45) {
  let mejor = 0, dist = Infinity;
  for (let i = 0; i <= 100; i++) {
    const d = i / 100, e = Math.abs(yArena(sustrato, limitar(x, 0, 100), bDe(d), alto) - y);
    if (e < dist) { dist = e; mejor = d; }
  }
  return mejor;
}

/**
 * Pantalla completa: de qué lado va la tarjeta de edición para no tapar lo elegido (en px de la pantalla).
 * Si caben dos tarjetas de ancho, al lado contrario (izq/der); si no, arriba o abajo.
 */
export function ladoTarjeta(px, py, ancho, alto, tarjeta = 300) {
  if (ancho >= tarjeta * 1.8) return px > ancho / 2 ? 'izq' : 'der';
  return py > alto / 2 ? 'arriba' : 'abajo';
}

/** "Agregar → Ver todas": el catálogo agrupado por tipo (solo los grupos que tienen algo). */
export function gruposAgregar(catalogo, paisaje = PAISAJE) {
  const zonas = [['Alfombras', 'primer'], ['Medio', 'medio'], ['Fondo', 'fondo'], ['Sobre rocas', 'epifita'], ['Flotantes', 'flotante']];
  return [
    ...zonas.map(([nombre, z]) => ({ nombre, items: catalogo.filter(p => p.zona === z).map(p => ({ planta: p.id, texto: p.nombre })) })),
    { nombre: 'Rocas', items: paisaje.filter(x => !x.id.startsWith('tronco')).map(x => ({ paisaje: x.id, texto: x.nombre })) },
    { nombre: 'Troncos', items: paisaje.filter(x => x.id.startsWith('tronco')).map(x => ({ paisaje: x.id, texto: x.nombre })) },
  ].filter(g => g.items.length);
}

/** Título de la lista de compras plegada: "Lista de compras · 14 plantas · 33 L de aquasoil". */
export function resumenCompras(compras, sustrato) {
  const n = compras.plantas.reduce((t, x) => t + x.cantidad, 0);
  return ['Lista de compras', n ? `${n} planta${n > 1 ? 's' : ''}` : '', sustrato ? `${Math.round(sustrato.litros)} L de ${sustrato.nombre.toLowerCase()}` : '']
    .filter(Boolean).join(' · ');
}

/** Brillo dorado en lo elegido (uno o varios). */
const resaltar = sel => {
  const ids = [].concat(sel || []);
  return ids.length ? `<style>${ids.map(id => `.vista-frontal [data-o="${id}"]`).join(',')}{filter:var(--f,) drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 3px #F2B544)}</style>` : '';
};

/**
 * La lámpara sobre el acuario: barra negra con sus LED encendidos según cada canal (rojo, verde, azul, UV/blanco)
 * y patas hasta el vidrio. Los LED apagados se ven grises.
 */
function lampara(colores) {
  const [r, g, b, u] = colores.map(v => Math.max(0, Math.min(100, v)) / 100);
  const led = (color, v) => `<i style="background:${v > 0.02 ? color : '#3A3F44'};opacity:${(0.35 + 0.65 * v).toFixed(2)};box-shadow:0 0 ${(2 + 6 * v).toFixed(1)}px ${v > 0.02 ? color : 'transparent'}"></i>`;
  const grupo = [led('#FF4A3D', r), led('#5CFF7A', g), led('#4A7DFF', b), led('#C9A8FF', u), led('#FFFFFF', Math.max(r, g, b) * 0.9)];
  return `<div class="lampara" aria-hidden="true"><div class="barra">${Array.from({ length: 6 }, () => grupo.join('')).join('<b></b>')}</div></div>`;
}

/** Vista frontal: lámpara, aire bajo el vidrio y el acuario con imágenes por capas, iluminado con los colores de la lámpara. */
const CANDADO = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
/** Vista frontal. candados: en el diseñador, lo bloqueado lleva un candado chico en su base (no sale en la imagen guardada). */
export function vistaFrontal({ acuario, diseno, catalogo, colores, seleccion, candados = false }) {
  const { largo = 100, alto = 45 } = acuario || {};
  const objetos = objetosDe(diseno, catalogo, alto, largo);
  const sustrato = diseno?.sustrato;
  const brillo = Math.max(...colores) / 100;
  const ctx = { largo, alto, catalogo, sustrato, objetos, profundidad: diseno?.profundidad !== false };
  const capas = objetos.map(o => dibujarObjeto(o, ctx)).join('') + (candados ? objetos.filter(o => o.bloqueado).map(o => {
    const ap = apoyo(o, ctx);
    return `<div class="candado" data-candado="${o.id}" style="left:${ap.x}%;bottom:${100 - ap.y + 0.5}%" title="Bloqueado: toca para desbloquear">${CANDADO}</div>`;
  }).join('') : '');
  const matriz = matrizLuz(colores), idLuz = `${LUZ_ID}-${++luzN}`;
  const borde = bordeSustrato(sustrato, alto);
  const tope = Math.min(...borde.map(p => p[1]));
  const tipo = tipoSustrato(acuario);
  const arena = `clip-path:polygon(${borde.map(([x, y]) => `${x}% ${y}%`).join(',')},100% 100%,0% 100%);z-index:1;` +
    `background:${fondoArena(tipo, tope, alto)}`;
  return `<div class="tanque" style="--prop:${(alto / largo * 1.09).toFixed(3)}">
    ${lampara(colores)}
    <div class="aire" style="aspect-ratio:${largo}/${(alto * 0.09).toFixed(1)}"></div>
    <svg class="filtro-luz" width="0" height="0" aria-hidden="true"><filter id="${idLuz}" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="${matriz.join(' ')}"/></filter></svg>
    <div class="vista-frontal" style="aspect-ratio:${largo}/${alto};filter:url(#${idLuz})" data-luz="${matriz.join(' ')}"
      role="img" aria-label="Vista frontal del acuario">
    <div class="agua"></div>
    <div class="sustrato" style="${arena}" data-tipo="${tipo}" data-alto="${alto}" data-borde="${borde.map(p => p.join(' ')).join(',')}"></div>
    <style>.vista-frontal{${OLAS.map((u, k) => `--ola${k}:url("${u}")`).join(';')}}</style>
    ${capas}
    ${resaltar(seleccion)}
    <div class="haz" style="opacity:${(brillo * 0.45).toFixed(2)}"></div>
    <div class="barra-luz" style="opacity:${(brillo * 0.9).toFixed(2)}"></div>
    ${objetos.length ? '' : '<div class="vacio">Toca "Editar diseño" para acomodar tus plantas</div>'}
  </div></div>`;
}

/** Plantas unidas a una roca o tronco: se mueven, giran y crecen con él. */
export const montados = (objetos, base) => objetos.filter(o => o.sobre?.id === base.id).map(o => o.id);

// ---------- Plantillas de estilo: un punto de partida que luego se mueve libremente ----------
export const PLANTILLAS = [
  { id: 'iwagumi', nombre: 'Iwagumi', nota: 'Rocas protagonistas, alfombra y pocas plantas' },
  { id: 'nature', nombre: 'Nature', nota: 'Tronco en diagonal, rocas, epífitas y masas de tallo' },
  { id: 'holandes', nombre: 'Holandés', nota: 'Grupos de tallos con contraste de color, sin piedras' },
  { id: 'jungla', nombre: 'Jungla', nota: 'Troncos, epífitas y vegetación densa' },
  { id: 'natural', nombre: 'Natural con tronco', nota: 'Tronco en diagonal con helechos, tallos rojos y naranjas atrás, arbustos rojos y alfombra en pendiente' },
];

/**
 * Arma un diseño con el estilo elegido usando las plantas del acuario (por zona). Las epífitas quedan unidas a su roca o tronco.
 * "Natural con tronco" necesita ciertos papeles (tallos rojos, verdes, arbustos rojos, helechos, alfombra): si tus plantas no
 * cubren alguno, usa una del catálogo (catalogo) para ese papel.
 */
export function plantilla(estilo, plantas, { largo = 100, alto = 45 } = {}, catalogo = []) {
  const r = azar(estilo);
  const zona = z => plantas.filter(p => p.zona === z);
  const tallos = zona('fondo'), medios = zona('medio'), alfombras = plantas.filter(esAlfombra), epifitas = zona('epifita');
  // Tallos ordenados por color: alterna rojos y verdes para que haya contraste entre grupos vecinos.
  const contraste = [...tallos.filter(p => p.rojo), ...tallos.filter(p => !p.rojo)];
  const alternados = contraste.length ? contraste.map((_, i) => contraste[i % 2 ? contraste.length - 1 - (i >> 1) : i >> 1]) : [];
  const obj = (o) => ({ id: nuevoId(), escala: 1, espejo: r() < 0.4, ...o });
  const out = [];
  const fila = (lista, desde, hasta, b, n, extra = {}) => {
    if (!lista.length) return;
    for (let k = 0; k < n; k++) {
      const x = desde + (hasta - desde) * (n === 1 ? 0.5 : k / (n - 1)) + (r() - 0.5) * 4;
      out.push(obj({ planta: lista[k % lista.length].id, x, b: b + (r() - 0.5) * 2, ...extra }));
    }
  };
  const roca = (id, x, b, escala, v = 0, rot = 0) => out.push(obj({ paisaje: id, x, b, escala, v, rot }));
  const sobre = (base, p, dx = 0) => { // epífita montada a media altura del elemento
    const pa = PAISAJE.find(z => z.id === base.paisaje);
    const h = pa.alto / alto * 100 * perspectivaV2(base.b) * base.escala;
    out.push(obj({ planta: p.id, x: base.x + dx, b: base.b - h * 0.55, escala: 0.8 }));
  };
  const n = Math.max(3, Math.round(largo / 20));
  if (estilo === 'iwagumi') {
    // Piedra principal fuera del centro (regla de tercios) y dos acompañantes más chicas, todas inclinadas igual.
    roca('roca-seiryu', 38, 86, 1.7, 0, -4);
    roca('roca-seiryu', 62, 88, 1.15, 1, -4);
    roca('roca-seiryu', 20, 90, 0.75, 2, -4);
    fila(tallos.length ? [tallos.find(p => !p.rojo) || tallos[0]] : [], 6, 94, 80, 2, { escala: 0.8 });
    fila(alfombras, 4, 96, 92, n + 1);
    fila(alfombras, 10, 90, 89, n, { escala: 0.9 });
  } else if (estilo === 'nature') {
    const tronco = obj({ paisaje: 'tronco-dragon', x: 46, b: 85, escala: 1.25, rot: -8 }); out.push(tronco);
    roca('roca-negra', 22, 89, 1.1, 0);
    roca('roca-negra', 74, 90, 0.9, 1);
    fila(alternados, 5, 95, 80, n + 1);
    fila(medios, 12, 88, 86, Math.max(2, n - 1));
    epifitas.forEach((p, i) => sobre(tronco, p, (i - (epifitas.length - 1) / 2) * 8));
    fila(alfombras, 4, 96, 92, n + 1);
  } else if (estilo === 'holandes') {
    // Calles de tallos escalonadas: altas atrás, medianas delante, sin piedras ni troncos.
    fila(alternados, 6, 94, 80, n + 1, { escala: 1.1 });
    fila(alternados.slice().reverse(), 14, 86, 84, n - 1, { escala: 0.75 });
    fila(medios, 10, 90, 88, n);
    fila(alfombras, 4, 96, 93, n + 1);
  } else if (estilo === 'natural') {
    // Como un paisaje natural de referencia: tronco en diagonal de atrás a la izquierda hacia el centro, con helechos;
    // rocas chicas en su base; tallos rojos y naranjas atrás con verde en medio; arbustos rojos al medio; alfombra al frente.
    const papel = (mias, ids) => mias.length ? mias : ids.map(id => catalogo.find(p => p.id === id)).filter(Boolean);
    const rojos = papel(tallos.filter(p => p.rojo), ['rotala-colorata', 'ludwigia-super-red', 'rotala-blood-red']);
    const verdes = papel(tallos.filter(p => !p.rojo && p.tallo), ['rotala-green']);
    const arbustos = papel(medios.filter(p => p.rojo), ['alternanthera']);
    const helechos = papel(epifitas.filter(p => p.id.startsWith('helecho')).concat(epifitas.filter(p => !p.id.startsWith('helecho'))), ['helecho-narrow', 'helecho-java']);
    const tapiz = papel(alfombras.filter(esTapiz), ['hc-cuba']);
    const tronco = obj({ paisaje: 'tronco-dragon', x: 37, b: 85, escala: 1.3, espejo: true, rot: 0 }); out.push(tronco); // a un tercio, no al centro
    roca('roca-negra', 21, 90, 0.7, 0); roca('roca-negra', 31, 91.5, 0.45, 1); roca('roca-negra', 72, 90.5, 0.65, 1);
    const atras = [[6, 0], [17, 1], [28, 0], [46, -1], [56, -1], [70, 2], [82, 2], [94, 1]]; // [x, cuál rojo] (-1 = verde)
    for (const [x, k] of atras) {
      const p = k < 0 ? verdes[0] : rojos[k % rojos.length];
      if (p) out.push(obj({ planta: p.id, x: x + (r() - 0.5) * 3, b: 80 + r() * 1.5, escala: 1.15, copias: 4 }));
    }
    if (verdes[0]) [[78, 84.5], [88, 85]].forEach(([x, b]) => out.push(obj({ planta: verdes[0].id, x, b, escala: 0.85 })));
    // Matas rojas separadas (con verde y roca entre ellas), no una pared.
    if (arbustos[0]) [[14, 87.5, 0.95], [44, 88.5, 0.8], [62, 88, 0.95]].forEach(([x, b, escala]) => out.push(obj({ planta: arbustos[0].id, x, b, escala, copias: 3 })));
    helechos.slice(0, 2).forEach((p, i) => sobre(tronco, p, i ? 10 : -12));
    if (helechos[0]) sobre(tronco, helechos[0], -2);
    fila(tapiz, 4, 96, 92.5, n + 1);
    fila(tapiz, 8, 92, 90, n, { escala: 0.9 });
  } else { // jungla
    const t1 = obj({ paisaje: 'tronco-spider', x: 28, b: 86, escala: 1.2, rot: 6 }); out.push(t1);
    const t2 = obj({ paisaje: 'tronco-manzanita', x: 72, b: 87, escala: 1.1, rot: -6 }); out.push(t2);
    fila(alternados, 4, 96, 80, n + 2, { escala: 1.15 });
    fila(medios, 8, 92, 88, n + 1);
    epifitas.forEach((p, i) => sobre(i % 2 ? t2 : t1, p));
    fila(alfombras, 6, 94, 93, n - 1, { escala: 0.8 });
  }
  return aV3(out, { largo, alto }); // armado en unidades de la versión 2 (las mismas posiciones de siempre)
}

// ---------- Etapa 3: vista desde arriba y lista de compras ----------
/** Profundidad en cm desde el vidrio de atrás (0) hasta el de adelante (ancho). */
export const profundidadCm = (b, ancho) => ancho * profundidad(b);

/** Color del mapa de alturas: más claro = más alto. */
const tonoAltura = (h, min, max) => {
  const t = max > min ? (h - min) / (max - min) : 0.5, c = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${c(48, 222)},${c(44, 206)},${c(40, 176)})`;
};

/**
 * Vista desde arriba (SVG en cm): el fondo arriba, el frente abajo. Tocar una mancha elige el objeto.
 * Con malla = { elegidos }: se edita la forma del sustrato (mapa de alturas con sus puntos; los objetos quedan tenues).
 */
export function vistaSuperior({ acuario, objetos, catalogo, seleccion = [], sustrato, malla }) {
  const { largo = 100, ancho = 40, alto = 45 } = acuario || {};
  const numeros = numerar(objetos), elegidos = new Set([].concat(seleccion));
  const ctx = { largo, alto, sustrato, objetos };
  const prof = o => bEfectiva(o, objetos); // lo unido a una roca o tronco va a la profundidad de su soporte
  const orden = [...objetos].sort((a, b) => !!a.planta - !!b.planta || prof(a) - prof(b)); // primero rocas y troncos, luego plantas
  const formas = orden.map(o => {
    const x = (o.sobre ? apoyo(o, ctx).x : o.x) / 100 * largo, y = profundidadCm(prof(o), ancho), e = o.escala || 1;
    const borde = elegidos.has(o.id) ? ' stroke="#F2B544" stroke-width="1.2"' : ' stroke="rgba(0,0,0,.35)" stroke-width=".4"';
    if (o.paisaje) {
      const pa = PAISAJE.find(z => z.id === o.paisaje); if (!pa) return '';
      const L = pa.ancho * 20 * e;
      if (pa.id.startsWith('tronco')) // un tronco desde arriba: una barra larga, girada como en el frente
        return `<rect data-o="${o.id}" x="${x - L / 2}" y="${y - 2.5}" width="${L}" height="5" rx="2.5" fill="#6B4A32" transform="rotate(${o.rot || 0} ${x} ${y})"${borde}><title>${escapar(pa.nombre)}</title></rect>`;
      return `<ellipse data-o="${o.id}" cx="${x}" cy="${y}" rx="${L / 2.4}" ry="${L / 3.6}" fill="${pa.id === 'roca-dragon' ? '#9A7B52' : pa.id === 'roca-negra' ? '#3B3E42' : '#7C858C'}"${borde}><title>${escapar(pa.nombre)}</title></ellipse>`;
    }
    const p = catalogo.find(z => z.id === o.planta); if (!p) return '';
    const rx = 10 * e * (esAlfombra(p) ? 1 : 0.8) * (o.sobre ? 0.6 : 1), ry = (esAlfombra(p) ? 5 : 4.5) * e * (o.sobre ? 0.6 : 1);
    const color = p.rojo ? '#B5483A' : esAlfombra(p) ? '#7CC46A' : '#4E9B4F';
    return `<g data-o="${o.id}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" fill-opacity=".85"${borde}/>` +
      `<text x="${x}" y="${y + 1.4}" font-size="4" text-anchor="middle" fill="#fff" style="pointer-events:none">${numeros[p.id]}</text><title>${escapar(p.nombre)}</title></g>`;
  }).join('');
  let mapa = '', puntos = '';
  if (malla) {
    const m = sustrato?.malla || mallaDesde(sustrato, alto), min = Math.min(...m.cm), max = Math.max(...m.cm);
    const N = 24, F = 12, w = largo / N, h = ancho / F; // celdas finas: se ve la forma suave
    for (let f = 0; f < F; f++) for (let c = 0; c < N; c++)
      mapa += `<rect x="${(c * w).toFixed(2)}" y="${(f * h).toFixed(2)}" width="${(w + 0.05).toFixed(2)}" height="${(h + 0.05).toFixed(2)}" fill="${tonoAltura(alturaSustrato({ malla: m }, (c + 0.5) / N * 100, (f + 0.5) / F), min, max)}"/>`;
    const sel = new Set(malla.elegidos || []);
    puntos = m.cm.map((cm, i) => {
      const px = (i % m.cols) / (m.cols - 1) * largo, py = Math.floor(i / m.cols) / (m.filas - 1) * ancho, si = sel.has(i);
      return `<circle data-m="${i}" cx="${px}" cy="${py}" r="${si ? 1.6 : 1.1}" fill="${si ? '#F2B544' : 'rgba(255,255,255,.75)'}" stroke="rgba(0,0,0,.5)" stroke-width=".3"/>` +
        (si ? `<text x="${px}" y="${py - 2.2}" font-size="2.8" text-anchor="middle" fill="#fff" style="pointer-events:none">${Math.round(cm)}</text>` : '');
    }).join('');
  }
  return `<svg class="vista-superior${malla ? ' editando' : ''}" viewBox="-2 -2 ${largo + 4} ${ancho + 4}" role="img" aria-label="Vista del acuario desde arriba">
    <rect x="0" y="0" width="${largo}" height="${ancho}" rx="2" fill="${SUSTRATOS[tipoSustrato(acuario)].colores[1]}" stroke="#5A6470" stroke-width=".6"/>
    <text x="${largo / 2}" y="-0.4" font-size="2.6" text-anchor="middle" fill="#8B96A0">fondo</text>
    <text x="${largo / 2}" y="${ancho + 1.9}" font-size="2.6" text-anchor="middle" fill="#8B96A0">frente</text>
    ${malla ? `${mapa}<g style="opacity:.22;pointer-events:none">${formas}</g>${puntos}` : formas}</svg>`;
}


/**
 * Lista de compras aproximada. Cada mata ocupa ~20 cm × escala de ancho:
 *  tallos: 1 maceta (~8 tallos) por cada ~10×10 cm (las matas se enciman); arbustos: 1 maceta por mata; alfombras: 1 vasito in vitro por ~12×12 cm;
 *  epífitas: 1 porción por mata; flotantes: 1 porción en total. Rocas y troncos: una pieza de ~alto × escala cm.
 */
const PLURAL = { maceta: 'macetas', 'vasito in vitro': 'vasitos in vitro', 'porción': 'porciones' };
export function listaCompras(objetos, catalogo) {
  const plantas = {}, piezas = {};
  for (const o of objetos) {
    const e = o.escala || 1;
    if (o.paisaje) {
      const pa = PAISAJE.find(z => z.id === o.paisaje); if (!pa) continue;
      (piezas[pa.id] ??= { nombre: pa.nombre, tamanos: [] }).tamanos.push(Math.round(pa.alto * e));
      continue;
    }
    const p = catalogo.find(z => z.id === o.planta); if (!p) continue;
    const ancho = 20 * e, x = (plantas[p.id] ??= { nombre: p.nombre, matas: 0, cm2: 0, zona: p.zona });
    // Más plantas en la mata = más que comprar (3 es lo normal).
    x.matas++; x.cm2 += ancho * (esAlfombra(p) ? 10 : 8) * (o.copias || 3) / 3;
    x.porMata = (x.porMata || 0) + (o.copias || 3) / 3;
  }
  const lineas = Object.values(plantas).map(x => {
    const [cantidad, unidad] =
      x.zona === 'fondo' ? [Math.ceil(x.cm2 / 100), 'maceta'] :
      x.zona === 'primer' ? [Math.ceil(x.cm2 / 150), 'vasito in vitro'] :
      x.zona === 'flotante' ? [1, 'porción'] :
      x.zona === 'epifita' ? [Math.ceil(x.porMata), 'porción'] : [Math.ceil(x.porMata), 'maceta'];
    return { nombre: x.nombre, matas: x.matas, cantidad, unidad: cantidad > 1 ? PLURAL[unidad] : unidad };
  });
  const hardscape = Object.values(piezas).map(x => ({ nombre: x.nombre, cantidad: x.tamanos.length,
    unidad: x.tamanos.length > 1 ? 'piezas' : 'pieza', detalle: `de ~${x.tamanos.sort((a, b) => b - a).join(', ')} cm de alto` }));
  return { plantas: lineas, hardscape };
}
