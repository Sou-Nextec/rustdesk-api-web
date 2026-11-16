// Regressão (rdgen#61 e rustdesk-api-web#131, 2026-10-26): máquina instalada por convite entrava como Pendente.
// O patch 0048 trocou o nome do MSI do convite para um nome fixo, sem o código, e o código passou a viajar só na marca
// de origem do arquivo (Zone.Identifier). O gerador (Sou-Nextec/rdgen) continuou com o agente antigo, que lia o código
// no nome, e nenhum teste ligava os dois lados.
//
// Este é o lado do painel do contrato. O lado do gerador é .github/scripts/test-convite-agente.ps1 no rdgen, que roda
// contra o agente empacotado no MSI com este mesmo nome de arquivo. Se este teste quebrar porque o formato mudou:
// ajuste o coordenador aqui, o test-convite-agente.ps1 do rdgen e sincronize o rdgen (nextec/scripts/sincronizar-agente.py).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { installerLinkUrl } from '../../src/nextec/public-links.mjs'

const raiz = join(import.meta.dirname, '..', '..')
const backend = join(raiz, 'nextec', 'backend')
const ALVO = 'http/controller/api/nextec_invite_public.go'

// estado final do download do convite: a última linha acrescentada com FileAttachment no arquivo do link público,
// percorrendo os patches na ordem em que o Dockerfile os aplica
function nomeDoDownload() {
  let ultima = null
  for (const nome of readdirSync(backend).filter((f) => f.endsWith('.patch')).sort()) {
    let atual = ''
    for (const linha of readFileSync(join(backend, nome), 'utf8').split(/\r?\n/)) {
      if (linha.startsWith('+++ ')) atual = linha.replace(/^\+\+\+ b\//, '')
      else if (atual === ALVO && linha.startsWith('+') && linha.includes('FileAttachment(')) ultima = linha
    }
  }
  return ultima
}

test('o MSI do convite sai com nome fixo, sem o código (o agente lê o código da marca de origem)', () => {
  const linha = nomeDoDownload()
  assert.ok(linha, 'download do convite não encontrado nos patches')
  assert.match(linha, /"nextec-acesso-"\+rel\.Version\+"\.msi"/,
    'mudou o nome do MSI do convite: atualize o coordenador, o test-convite-agente.ps1 do rdgen e sincronize o rdgen')
  assert.doesNotMatch(linha, /\bcode\b/, 'o código voltou ao nome do arquivo: revise o contrato com o agente')
})

test('o coordenador do painel lê o código da marca de origem e o teste dele usa o nome fixo do download', () => {
  const coord = readFileSync(join(raiz, 'nextec', 'atualizacao', 'Coordenar-Agente-Nextec.ps1'), 'utf8')
  assert.match(coord, /-Stream 'Zone\.Identifier'/, 'coordenador sem leitura do Zone.Identifier')
  assert.match(coord, /HostUrl/, 'coordenador sem HostUrl')
  const teste = readFileSync(join(raiz, 'nextec', 'atualizacao', 'test_convite_origem.ps1'), 'utf8')
  assert.match(teste, /'nextec-acesso-[\d.]+\.msi'[^\n]*HostUrl=[^\n]*\/i\/\$code\/baixar/,
    'test_convite_origem.ps1 precisa cobrir o nome fixo servido pelo painel com HostUrl /i/<código>/baixar')
})

// Regressão (2026-11-16): o link entregue ao cliente é /instalador/<código> (patch 0042), mas o coordenador só reconhecia
// /i/<código> na marca de origem. O navegador grava HostUrl=.../instalador/<código>/baixar e a máquina entrava como Pendente.
// Aqui o padrão do coordenador é lido do próprio script e testado contra o link que o painel realmente monta.
test('o coordenador reconhece o link que o painel entrega (/instalador/<código>) e o antigo /i/<código>', () => {
  const coord = readFileSync(join(raiz, 'nextec', 'atualizacao', 'Coordenar-Agente-Nextec.ps1'), 'utf8')
  const achou = coord.match(/function Get-NextecInviteCodeFromUrl[\s\S]*?\[regex\]::Match\(\$Url, '([^']+)'/)
  assert.ok(achou, 'padrão de URL do coordenador não encontrado')
  const re = new RegExp(achou[1], 'i')
  const code = 'K7M2QX9P4TA8B3C5D6E2'
  const link = installerLinkUrl('https://painel-remoto.nex.tec.br', code)
  assert.match(link, new RegExp(`/instalador/${code}$`), 'o link público do convite mudou de caminho')
  for (const url of [link, `${link}/baixar`, `https://painel-remoto.nex.tec.br/i/${code}/baixar`]) {
    assert.ok(re.test(url), `o coordenador não lê o código de ${url}: ajuste Get-NextecInviteCodeFromUrl e sincronize o rdgen`)
  }
  assert.ok(!re.test(`https://painel-remoto.nex.tec.br/atendimento/${code}/baixar`), 'link de atendimento não é convite')
})
