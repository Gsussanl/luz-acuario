// Protocolo de la Week Aqua L900 Pro (familia 4, tipo 5746). Ver PROTOCOLO.md.
// Solo funciones puras: arman comandos hex de 8 bytes; no saben nada de Bluetooth.

export const MANUAL = 'FDF1555555555555';
export const TRAS_RELOJ = 'F955555555555555'; // la app oficial lo manda siempre después de poner la hora
export const CANALES = ['Rojo', 'Verde', 'Azul', 'UV'];

const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');
const dos = n => String(n).padStart(2, '0'); // horas en BCD: 14 -> "14"

/** 4 porcentajes (rojo, verde, azul, uv) -> FBF9. El 100 % de la lámpara es 0xEB (235), no 255. */
export function cmdColor(canales) {
  if (canales.length !== 4 || !canales.every(p => Number.isInteger(p) && p >= 0 && p <= 100)) {
    throw new Error('Los 4 canales van de 0 a 100');
  }
  return 'FBF9' + canales.map(p => hex2(Math.round(p * 2.35))).join('') + '5555';
}

/** Hora del celular -> reloj de la lámpara. */
export function cmdReloj(fecha) {
  return 'FF' + dos(fecha.getHours()) + dos(fecha.getMinutes()) + dos(fecha.getSeconds()) + '55555555';
}

/**
 * Horario diario: encender y apagar ("HH:MM") y duración del amanecer/atardecer en minutos (0–150, de 30 en 30).
 * shortcut: no sabemos si la rampa ocurre dentro o fuera de la ventana; la UI asume que empieza al encender. Confirmar observando la lámpara.
 */
export function cmdHorario({ encender, apagar, rampaMin }) {
  const hhmm = s => {
    const m = /^(\d{2}):(\d{2})$/.exec(s);
    if (!m || +m[1] > 24 || +m[2] > 59 || (+m[1] === 24 && +m[2] !== 0)) throw new Error(`Hora no válida: ${s}`);
    return m[1] + m[2];
  };
  const a = hhmm(encender), b = hhmm(apagar);
  if (b <= a) throw new Error('La hora de apagar debe ser después de la de encender');
  if (!Number.isInteger(rampaMin) || rampaMin < 0 || rampaMin > 150 || rampaMin % 30) throw new Error('El amanecer va de 0 a 2.5 h, en pasos de 30 min');
  return 'FEF9' + a + b + '00' + hex2(rampaMin / 30);
}

/** "Guardar en la lámpara": modo manual, color del día y horario. */
export function guardarHorario(horario, colores) {
  return [MANUAL, cmdColor(colores), cmdHorario(horario)];
}

/**
 * Poner la hora de la lámpara. Va SIEMPRE al final y por separado: tras F955 la lámpara parece reiniciarse
 * (se apaga unos segundos y corta el Bluetooth; probado el 18 nov 2026), así que lo que venga después se pierde.
 */
export function ponerHora(ahora = new Date()) {
  return [cmdReloj(ahora), TRAS_RELOJ];
}

/** ¿La hora "HH:MM" cae dentro de la ventana encender–apagar? */
export function dentroDeHorario({ encender, apagar }, hora) {
  return hora >= encender && hora < apagar;
}

/** Encender fuera de horario: ventana 00:00–24:00 (es lo que hace la app oficial al "prender"). */
export function encenderSiempre(colores) {
  return [MANUAL, cmdColor(colores), cmdHorario({ encender: '00:00', apagar: '24:00', rampaMin: 0 })];
}

/**
 * Apagado suave sin tinte, en 2 comandos (con muchos comandos seguidos cada uno reinicia el fundido y "vibra").
 * 1) los canales encendidos bajan parejos al nivel del más bajo (máx. 20 %), pero el ROJO a la mitad:
 *    con todos parejos el rojo seguía viéndose al final (sus LED se notan más a poca potencia; 18 nov 2026);
 * 2) todos a 0.
 * shortcut: el factor 0.5 del rojo es una prueba; ajustar con lo que se vea en la lámpara.
 */
export function pasosApagado(colores) {
  const encendidos = colores.filter(p => p > 0);
  if (!encendidos.length) return [cmdColor([0, 0, 0, 0])];
  const nivel = Math.min(20, ...encendidos);
  const parejo = colores.map(p => Math.min(p, nivel));
  parejo[0] = Math.round(parejo[0] / 2);
  return [cmdColor(parejo), cmdColor([0, 0, 0, 0])];
}

/** Horas de luz completa, descontando la rampa al inicio y al final. */
export function horasCompletas({ encender, apagar, rampaMin }) {
  const min = s => +s.slice(0, 2) * 60 + +s.slice(3);
  return Math.max(0, (min(apagar) - min(encender) - 2 * rampaMin) / 60);
}
