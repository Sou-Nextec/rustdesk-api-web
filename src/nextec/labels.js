// Alguns títulos de coluna do upstream estão fixos no template (sem passar por T()).
// Em vez de editar essas telas, traduzimos o texto exato do cabeçalho da tabela aqui.
// Se o upstream passar a usar T() nesses pontos, este mapa deixa de ter efeito sem causar erro.
const HEADERS = {
  client: 'Cliente',
  uuid: 'UUID',
  ip: 'IP',
  type: 'Tipo',
  id: 'ID',
  'Platform/UA': 'Plataforma/Agente',
}

function translate (root) {
  root.querySelectorAll?.('.el-table th .cell').forEach(cell => {
    const text = cell.textContent.trim()
    const pt = HEADERS[text]
    if (pt && pt !== text) cell.textContent = pt
  })
}

export function translateHardcodedHeaders () {
  const observer = new MutationObserver(() => translate(document))
  observer.observe(document.body, { childList: true, subtree: true })
}
