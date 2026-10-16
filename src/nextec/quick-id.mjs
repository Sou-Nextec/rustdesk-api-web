// Código do atendimento do Suporte rápido: seis dígitos aleatórios no formato "482-913".
// Propositalmente diferente do ID do RustDesk (nove dígitos em grupos de três), para ninguém confundir os dois.
// É só um rótulo fácil de ditar por telefone; o segredo do link é o token que o servidor gera.

// random: função que devolve um inteiro de 32 bits sem sinal (injetável para teste).
export function randomSessionId (random = defaultRandom) {
  const n = 100000 + (random() % 900000)
  const s = String(n)
  return `${s.slice(0, 3)}-${s.slice(3)}`
}

function defaultRandom () {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0]
}

// Rótulo gravado no link: o texto opcional do técnico seguido do código, ou só "Atendimento <código>".
export function sessionLabel (text, id) {
  const t = String(text || '').trim().slice(0, 90)
  return t ? `${t} (${id})` : `Atendimento ${id}`
}
