const COSTANTI_SHA256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const STATO_INIZIALE = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
] as const;

function ruotaDestra(valore: number, posizioni: number): number {
  return (valore >>> posizioni) | (valore << (32 - posizioni));
}

function aggiungiPuntoCodiceUtf8(byte: number[], puntoCodice: number): void {
  if (puntoCodice <= 0x7f) {
    byte.push(puntoCodice);
  } else if (puntoCodice <= 0x7ff) {
    byte.push(0xc0 | (puntoCodice >>> 6), 0x80 | (puntoCodice & 0x3f));
  } else if (puntoCodice <= 0xffff) {
    byte.push(
      0xe0 | (puntoCodice >>> 12),
      0x80 | ((puntoCodice >>> 6) & 0x3f),
      0x80 | (puntoCodice & 0x3f),
    );
  } else {
    byte.push(
      0xf0 | (puntoCodice >>> 18),
      0x80 | ((puntoCodice >>> 12) & 0x3f),
      0x80 | ((puntoCodice >>> 6) & 0x3f),
      0x80 | (puntoCodice & 0x3f),
    );
  }
}

function codificaUtf8(testo: string): number[] {
  const byte: number[] = [];

  for (let indice = 0; indice < testo.length; indice += 1) {
    const valoreLetto = testo.codePointAt(indice) ?? 0xfffd;
    const puntoCodice =
      valoreLetto >= 0xd800 && valoreLetto <= 0xdfff ? 0xfffd : valoreLetto;

    aggiungiPuntoCodiceUtf8(byte, puntoCodice);
    if (valoreLetto > 0xffff) indice += 1;
  }

  return byte;
}

/** Calcola SHA-256 senza dipendenze da API Node o browser. */
export function sha256(testo: string): string {
  const messaggio = codificaUtf8(testo);
  const lunghezzaOriginale = messaggio.length;
  const lunghezzaBitAlta = Math.floor(lunghezzaOriginale / 0x20000000);
  const lunghezzaBitBassa = (lunghezzaOriginale << 3) >>> 0;

  messaggio.push(0x80);
  while (messaggio.length % 64 !== 56) messaggio.push(0);

  for (let spostamento = 24; spostamento >= 0; spostamento -= 8) {
    messaggio.push((lunghezzaBitAlta >>> spostamento) & 0xff);
  }
  for (let spostamento = 24; spostamento >= 0; spostamento -= 8) {
    messaggio.push((lunghezzaBitBassa >>> spostamento) & 0xff);
  }

  const stato: number[] = [...STATO_INIZIALE];
  const parole = new Array<number>(64).fill(0);

  for (let blocco = 0; blocco < messaggio.length; blocco += 64) {
    for (let indice = 0; indice < 16; indice += 1) {
      const posizione = blocco + indice * 4;
      parole[indice] =
        (((messaggio[posizione] ?? 0) << 24) |
          ((messaggio[posizione + 1] ?? 0) << 16) |
          ((messaggio[posizione + 2] ?? 0) << 8) |
          (messaggio[posizione + 3] ?? 0)) >>>
        0;
    }

    for (let indice = 16; indice < 64; indice += 1) {
      const parola15 = parole[indice - 15] ?? 0;
      const parola2 = parole[indice - 2] ?? 0;
      const sigma0 =
        ruotaDestra(parola15, 7) ^
        ruotaDestra(parola15, 18) ^
        (parola15 >>> 3);
      const sigma1 =
        ruotaDestra(parola2, 17) ^
        ruotaDestra(parola2, 19) ^
        (parola2 >>> 10);
      parole[indice] =
        ((parole[indice - 16] ?? 0) +
          sigma0 +
          (parole[indice - 7] ?? 0) +
          sigma1) >>>
        0;
    }

    let a = stato[0] ?? 0;
    let b = stato[1] ?? 0;
    let c = stato[2] ?? 0;
    let d = stato[3] ?? 0;
    let e = stato[4] ?? 0;
    let f = stato[5] ?? 0;
    let g = stato[6] ?? 0;
    let h = stato[7] ?? 0;

    for (let indice = 0; indice < 64; indice += 1) {
      const somma1 = ruotaDestra(e, 6) ^ ruotaDestra(e, 11) ^ ruotaDestra(e, 25);
      const scelta = (e & f) ^ (~e & g);
      const temporaneo1 =
        (h + somma1 + scelta + (COSTANTI_SHA256[indice] ?? 0) + (parole[indice] ?? 0)) >>>
        0;
      const somma0 = ruotaDestra(a, 2) ^ ruotaDestra(a, 13) ^ ruotaDestra(a, 22);
      const maggioranza = (a & b) ^ (a & c) ^ (b & c);
      const temporaneo2 = (somma0 + maggioranza) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporaneo1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporaneo1 + temporaneo2) >>> 0;
    }

    stato[0] = ((stato[0] ?? 0) + a) >>> 0;
    stato[1] = ((stato[1] ?? 0) + b) >>> 0;
    stato[2] = ((stato[2] ?? 0) + c) >>> 0;
    stato[3] = ((stato[3] ?? 0) + d) >>> 0;
    stato[4] = ((stato[4] ?? 0) + e) >>> 0;
    stato[5] = ((stato[5] ?? 0) + f) >>> 0;
    stato[6] = ((stato[6] ?? 0) + g) >>> 0;
    stato[7] = ((stato[7] ?? 0) + h) >>> 0;
  }

  return stato.map((valore) => valore.toString(16).padStart(8, "0")).join("");
}
