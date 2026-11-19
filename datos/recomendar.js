// Plantas + habitantes + equipo del acuario -> recomendación de luz, CO2 y abonado.
// Rangos tomados del consenso de la comunidad (UKAPS, guías high-tech); son punto de partida, no receta.
// shortcut: los % de intensidad son para la L900 Pro a 45 cm de alto sin medir PAR; ajustar con un medidor PAR o con la comunidad.

const LUZ = {
  1: { nivel: 'Baja', intensidad: 45, horas: 7, par: '15–30 µmol' },
  2: { nivel: 'Media', intensidad: 65, horas: 7, par: '30–60 µmol' },
  3: { nivel: 'Alta', intensidad: 85, horas: 8, par: '60+ µmol' },
};

const ABONADO = {
  1: { metodo: 'Abono líquido todo en uno, 1 vez por semana', cambioAgua: '20–30 % cada semana' },
  2: { metodo: 'Abono líquido todo en uno, 2–3 veces por semana', cambioAgua: '30 % cada semana' },
  3: { metodo: 'Macros y micros en días alternos (estilo EI)', cambioAgua: '50 % cada semana para "reiniciar"' },
};

/**
 * Plan de arranque: 6 h la primera semana y +30 min por semana hasta llegar al objetivo.
 * @param {number} objetivo horas de luz completa recomendadas
 * @param {number} dias días desde el montaje (0 = se está montando)
 */
export function horasDeArranque(objetivo, dias) {
  const semana = Math.max(0, Math.floor(dias / 7));
  return Math.min(objetivo, 6 + 0.5 * semana);
}

/** Avisos por cantidad: especies de cardumen con menos ejemplares de los recomendados. */
export function avisosDeGrupo(habitantesConCantidad) {
  return habitantesConCantidad
    .filter(({ especie, cantidad }) => cantidad > 0 && cantidad < especie.grupo)
    .map(({ especie, cantidad }) => `${especie.nombre}: tienes ${cantidad}; se recomiendan al menos ${especie.grupo} para que estén tranquilos.`);
}

/** Avisos que dependen del sustrato: alfombras en gravilla, plantas de raíz sin nutrientes, aquasoil nuevo o gastado. */
export function avisosDeSustrato(plantas, habitantes, sustrato, dias) {
  const avisos = [];
  const nombres = l => l.map(x => x.nombre).join(', ');
  const alfombras = plantas.filter(p => p.zona === 'primer');
  if (sustrato === 'gravilla' && alfombras.length)
    avisos.push(`${nombres(alfombras)}: las alfombras no enraízan bien en gravilla. Usa aquasoil o arena fina.`);
  const deRaiz = plantas.filter(p => p.raiz);
  if (sustrato !== 'aquasoil' && deRaiz.length)
    avisos.push(`${nombres(deRaiz)}: pon pastillas de abono junto a sus raíces cada 2–3 meses.`);
  if (sustrato === 'aquasoil' && dias != null && dias < 28)
    avisos.push('Aquasoil nuevo libera amonio: cambia 50 % del agua 2 veces por semana el primer mes. No metas camarones todavía.');
  if (sustrato === 'aquasoil' && dias != null && dias > 548)
    avisos.push('Tu aquasoil probablemente ya se agotó: agrega pastillas de abono.');
  const dura = habitantes.filter(h => h.agua === 'dura');
  if (sustrato === 'aquasoil' && dura.length)
    avisos.push(`${nombres(dura)}: el aquasoil baja el pH y la dureza (KH), y ${dura.length > 1 ? 'prefieren' : 'prefiere'} agua más dura.`);
  return avisos;
}

/**
 * @param {object[]} plantas  elementos de plantas.json
 * @param {object[]} habitantes  elementos de habitantes.json
 * @param {{co2: boolean, nuevo: boolean, sustrato?: string, dias?: number}} equipo  co2 = tiene CO2 inyectado; nuevo = menos de 6 semanas;
 *   sustrato = 'aquasoil' | 'silice' | 'gravilla'; dias = días desde el montaje
 */
export function recomendar(plantas, habitantes, { co2, nuevo, sustrato = 'aquasoil', dias }) {
  const avisos = [];
  // La planta más exigente manda, pero sin CO2 no conviene pasar de luz media (algas).
  let nivel = Math.max(1, ...plantas.map(p => p.luz));
  const necesitanCO2 = plantas.filter(p => p.co2 === 2);
  if (!co2 && necesitanCO2.length) {
    avisos.push(`${necesitanCO2.map(p => p.nombre).join(', ')} necesita CO₂. Sin CO₂ va a sufrir y saldrán algas.`);
    nivel = Math.min(nivel, 2);
  }

  const luz = { ...LUZ[nivel] };
  if (nuevo) {
    luz.horas = 6;
    avisos.push('Acuario nuevo: empieza con 6 h de luz y sube 30 min por semana hasta llegar al objetivo.');
  }
  // Más rojo si hay plantas rojas; el UV de la L900 Pro se deja bajo para no favorecer algas.
  const hayRojas = plantas.some(p => p.rojo);
  luz.canales = { rojo: hayRojas ? 80 : 60, verde: 70, azul: 60, uv: 30 };

  const abonado = { ...ABONADO[co2 ? nivel : Math.min(nivel, 2)] };
  abonado.sustrato = sustrato === 'aquasoil'
    ? (dias > 540 // ~18 meses: el aquasoil ya soltó lo que traía
      ? 'Tu aquasoil ya no aporta nutrientes: usa el abono líquido de arriba y añade pastillas de abono en las raíces cada 2–3 meses.'
      : 'El aquasoil ya trae nutrientes: el primer año basta con el abono líquido de arriba.')
    : `La ${sustrato === 'silice' ? 'arena sílice' : 'gravilla'} no trae nutrientes: todo depende del abono líquido y de las pastillas.`;
  avisos.push(...avisosDeSustrato(plantas, habitantes, sustrato, dias));
  if (hayRojas) abonado.extra = 'Las plantas rojas agradecen hierro extra.';

  let co2Rec = null;
  if (co2) {
    const sensiblesCO2 = habitantes.filter(h => h.sensible.includes('co2_alto'));
    co2Rec = {
      objetivo: sensiblesCO2.length ? '20–25 ppm' : nivel === 3 ? '25–35 ppm' : '20–25 ppm',
      inicio: '1 hora antes de prender la luz',
      fin: '1 hora antes de apagar la luz',
      control: 'Drop checker con solución de 4 dKH: verde lima',
    };
    if (sensiblesCO2.length) avisos.push(`${sensiblesCO2.map(h => h.nombre).join(', ')}: sube el CO₂ poco a poco y vigila que no boqueen en la superficie.`);
  }

  const conCobre = habitantes.filter(h => h.sensible.includes('cobre'));
  if (conCobre.length) avisos.push(`${conCobre.map(h => h.nombre).join(', ')}: usa abonos sin cobre o con muy poco.`);
  const comePlantas = habitantes.filter(h => !h.plantas);
  if (comePlantas.length) avisos.push(`${comePlantas.map(h => h.nombre).join(', ')} se come o arranca las plantas.`);

  return { luz, co2: co2Rec, abonado, avisos };
}
