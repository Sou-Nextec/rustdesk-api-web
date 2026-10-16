// ID do atendimento do Suporte rápido: nove dígitos aleatórios no formato "482 913 076", como o TeamViewer.
// É só um rótulo fácil de ditar por telefone; o segredo do link é o token que o servidor gera.

// random: função que devolve um inteiro de 32 bits sem sinal (injetável para teste).
export function randomSessionId (random = defaultRandom) {
  const n = 100000000 + (random() % 900000000)
  return String(n).replace(/(\d{3})(?=\d)/g, '$1 ')
}

function defaultRandom () {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0]
}

// Rótulo gravado no link: o texto opcional do técnico seguido do ID, ou só "Suporte <ID>".
export function sessionLabel (text, id) {
  const t = String(text || '').trim().slice(0, 90)
  return t ? `${t} (${id})` : `Suporte ${id}`
}
