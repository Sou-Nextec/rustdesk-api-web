// Tabelas no celular: o Element Plus renderiza colunas largas que obrigam a rolar para o lado, e as ações ficavam fora da tela.
// Em telas estreitas, cada linha vira um cartão (CSS em theme.scss, classe .nx-m-cards) e este arquivo copia o título de
// cada coluna para o atributo data-label das células, que o CSS mostra como rótulo. Não muda dados nem lógica das telas.
const mobile = window.matchMedia('(max-width: 768px)')
let timer = null

// títulos das colunas: da própria tabela ou, se ela não tem cabeçalho (seções de Dispositivos), da primeira tabela do mesmo cartão
function headerNames (table) {
  const own = table.querySelector('.el-table__header thead tr:last-child')
  if (own) return [...own.children].map(th => (th.innerText || '').trim())
  const host = table.closest('.nx-card') || table.parentElement
  const first = host && host.querySelector('.el-table__header thead tr:last-child')
  return first ? [...first.children].map(th => (th.innerText || '').trim()) : []
}

function label () {
  document.querySelectorAll('.el-table').forEach((table) => {
    const names = headerNames(table)
    if (!names.length) return
    table.querySelectorAll('.el-table__body tbody tr').forEach((tr) => {
      ;[...tr.children].forEach((td, i) => {
        const name = names[i] || ''
        if (td.getAttribute('data-label') !== name) td.setAttribute('data-label', name)
        // célula sem conteúdo some no cartão (não adianta mostrar rótulo sem valor)
        const cell = td.querySelector('.cell')
        const empty = !!cell && !cell.textContent.trim() && !cell.querySelector('img,svg,button,input,.el-switch,.el-checkbox')
        if (td.hasAttribute('data-empty') !== empty) td.toggleAttribute('data-empty', empty)
      })
    })
  })
}

function run () {
  timer = null
  document.documentElement.classList.toggle('nx-m-cards', mobile.matches)
  if (mobile.matches) label()
}

function schedule () {
  if (timer) return
  // setTimeout (e não requestAnimationFrame) para continuar funcionando com a aba em segundo plano
  timer = setTimeout(run, 60)
}

export function startMobileTables () {
  mobile.addEventListener('change', schedule)
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  schedule()
}
