// Capa Bluetooth común. La interfaz solo usa: enlazar, reconectar, escribir, desconectar, alCambiar.
// Esta es la versión Web Bluetooth (Chrome Android / TWA). Una versión nativa (Capacitor) implementaría lo mismo.

const ESCRITURA = ['0000fff2', '0000ffe3', '0000ffe1']; // en el orden que prefiere la app oficial
const espera = ms => new Promise(r => setTimeout(r, ms));
const bytes = h => new Uint8Array(h.match(/../g).map(b => parseInt(b, 16)));

export function crearBluetooth() {
  let dispositivo = null, car = null, cerradoPorUsuario = false;
  let cola = Promise.resolve();
  const oyentes = new Set();
  const avisar = estado => oyentes.forEach(f => f(estado));

  async function abrir() {
    avisar({ tipo: 'conectando', nombre: dispositivo.name });
    const gatt = await dispositivo.gatt.connect();
    car = null;
    for (const s of await gatt.getPrimaryServices()) {
      for (const c of await s.getCharacteristics()) {
        const orden = ESCRITURA.findIndex(p => c.uuid.startsWith(p));
        if (orden >= 0 && (!car || orden < car.orden)) car = { c, orden };
      }
    }
    if (!car) throw new Error('Conecté, pero esta lámpara no tiene dónde escribir. Puede que no sea compatible.');
    avisar({ tipo: 'conectada', nombre: dispositivo.name });
  }

  async function alDesconectar() {
    car = null;
    if (cerradoPorUsuario) return avisar({ tipo: 'desconectada' });
    // Reintentos cortos: la lámpara se cae si el celular se aleja o si otra app se le conecta.
    for (let i = 1; i <= 3; i++) {
      avisar({ tipo: 'reconectando', intento: i });
      await espera(1500 * i);
      try { await abrir(); return; } catch { /* siguiente intento */ }
    }
    avisar({ tipo: 'perdida' });
  }

  function preparar(d) {
    dispositivo = d;
    cerradoPorUsuario = false;
    dispositivo.addEventListener('gattserverdisconnected', alDesconectar);
  }

  return {
    disponible: () => !!navigator.bluetooth,
    alCambiar(f) { oyentes.add(f); return () => oyentes.delete(f); },
    conectada: () => !!car,

    /** Abre el selector de Chrome para elegir la lámpara. Debe llamarse desde un toque del usuario. */
    async enlazar() {
      preparar(await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'B3.0' }],
        optionalServices: [0xfff0, 0xffe0],
      }));
      await abrir();
    },

    /** Lámpara ya autorizada en una visita anterior, si Chrome lo permite (getDevices). */
    async recordada() {
      if (!navigator.bluetooth?.getDevices) return null;
      const lista = await navigator.bluetooth.getDevices();
      return lista.find(d => d.name?.startsWith('B3.0')) || null;
    },

    /** Reconecta a una lámpara recordada. Tras recargar, Chrome a veces no la "ve" hasta oír su anuncio: se espera hasta 8 s. */
    async reconectar(d) {
      preparar(d);
      try { await abrir(); } catch (e) {
        if (!d.watchAdvertisements) throw e;
        await new Promise((ok, mal) => {
          const ac = new AbortController();
          const t = setTimeout(() => { ac.abort(); mal(new Error('La lámpara no respondió. ¿Está encendida y cerca?')); }, 8000);
          d.addEventListener('advertisementreceived', () => { clearTimeout(t); ac.abort(); ok(); }, { once: true });
          d.watchAdvertisements({ signal: ac.signal }).catch(err => { clearTimeout(t); mal(err); });
        });
        await abrir();
      }
    },
    /** Chrome puede recordar la lámpara entre visitas (getDevices). En Android suele venir apagado. */
    recuerda: () => !!navigator.bluetooth?.getDevices,

    /** Escribe comandos en orden, uno a la vez. pausa = ms entre comandos (la app oficial usa 300–500). */
    escribir(lista, { pausa = 300 } = {}) {
      const p = cola.then(async () => {
        for (const h of lista) {
          if (!car) throw new Error('La lámpara no está conectada.');
          await car.c.writeValueWithoutResponse(bytes(h));
          if (pausa) await espera(pausa);
        }
      });
      cola = p.catch(() => {}); // un error no bloquea los siguientes envíos
      return p;
    },

    desconectar() {
      cerradoPorUsuario = true;
      dispositivo?.gatt?.disconnect();
    },
  };
}
