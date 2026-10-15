// Trava de integridade do repositório (sem dependências). Roda no CI antes dos testes e do build:
//   node nextec/testes/verificar-integridade.mjs
// Falha, listando os arquivos, se:
//   (a) patch, .sh, Dockerfile ou workflow estiver com CRLF no repositório (o git apply e o sh do Linux rejeitam);
//   (b) .ps1 com byte não ASCII não começar com BOM UTF-8 (o Windows PowerShell 5.1 lê como ANSI e quebra o parse);
//   (c) a série nextec/backend/*.patch não aplicar em ordem (o git apply real roda no build da imagem, também em PR;
//       aqui só se confere a ordem/nomes e o formato, que é o que o Linux rejeita primeiro);
//   (d) o ambiente de testes estiver incompleto (npm ci não rodou: falta @vue/compiler-sfc);
//   (e) script de produção depender de texto localizado do Windows (nome de conta/grupo, saída de utilitário, cultura).
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const git = (...a) => execFileSync('git', a, { maxBuffer: 256 * 1024 * 1024 })
const raiz = git('rev-parse', '--show-toplevel').toString().trim()
process.chdir(raiz)
const arquivos = git('ls-files', '-z').toString().split('\0').filter(Boolean)
const eol = new Map()
for (const l of git('ls-files', '--eol').toString().split('\n')) {
  const m = l.match(/^i\/(\S+)\s+w\/\S+\s+attr\/.*?\t(.+)$/)
  if (m) eol.set(m[2], m[1])
}
const erros = []
const falha = (titulo, lista, dica) => { if (lista.length) erros.push(`${titulo}\n${lista.map(f => '    ' + f).join('\n')}\n  Como corrigir: ${dica}`) }

// (a) CRLF no repositório (índice) em arquivos que o Linux lê
const linux = f => /\.(patch|sh|yml|yaml)$/.test(f) || /(^|\/)Dockerfile$/.test(f)
falha('(a) CRLF em arquivo lido pelo Linux (patch, .sh, Dockerfile ou workflow):',
  arquivos.filter(f => linux(f) && ['crlf', 'mixed'].includes(eol.get(f))),
  'converta para LF (dos2unix ou "git add --renormalize <arquivo>" com o .gitattributes do repositório) e gere o patch com "git diff" sem autocrlf')

// (b) .ps1 com não ASCII precisa de BOM
const semBom = []
for (const f of arquivos.filter(f => /\.ps1$/i.test(f))) {
  const b = git('show', ':' + f)
  const bom = b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF
  if (!bom && b.some(x => x > 0x7F)) semBom.push(f)
}
falha('(b) .ps1 com caracteres não ASCII sem BOM UTF-8:', semBom,
  'salve como UTF-8 com BOM (EF BB BF) e valide no Windows PowerShell 5.1 com [System.Management.Automation.Language.Parser]::ParseFile')

// (c) série de patches: nomes NNNN-*.patch, sem repetir número e com cabeçalho de diff
const patches = arquivos.filter(f => /^nextec\/backend\/[^/]+\.patch$/.test(f)).sort()
const ruins = []
const numeros = new Map()
for (const p of patches) {
  const n = (p.match(/backend\/(\d{4})-/) || [])[1]
  if (!n) { ruins.push(`${p} (nome fora do padrão NNNN-descricao.patch)`); continue }
  if (numeros.has(n)) ruins.push(`${p} (número ${n} repetido com ${numeros.get(n)})`)
  numeros.set(n, p)
  if (!/^diff --git /m.test(git('show', ':' + p).toString('utf8'))) ruins.push(`${p} (sem "diff --git": não é um patch git)`)
}
falha('(c) série de patches inválida:', ruins, 'renomeie com o próximo número livre e gere com "git diff"/"git format-patch"')

// (d) ambiente dos testes de node
try { createRequire(import.meta.url).resolve('@vue/compiler-sfc') } catch {
  erros.push('(d) @vue/compiler-sfc não encontrado: rodou "npm ci"? Os testes templates-declarados, secrets-view e rodape-versao dependem dele.\n  Como corrigir: npm ci --no-audit --no-fund')
}

// (e) dependência de texto localizado (o agente, o .cmd e os testes valem em QUALQUER idioma do Windows):
//     nome de conta/grupo comparado como texto (SYSTEM vira SISTEMA no pt-BR), saída textual de utilitário do Windows,
//     mensagem de erro do Windows/.NET em -match/-like, data formatada com a cultura do processo.
//     Identidade = SID; decisão = código numérico/propriedade; data de log = InvariantCulture.
const producao = f => /^(nextec\/atualizacao\/(?!test_)[^/]+\.(ps1|py)|src\/nextec\/[^/]+\.mjs)$/.test(f)
const NOMES = String.raw`(?:SYSTEM|SISTEMA|SYST[EÈ]ME|NT AUTHORITY[^'"]*|AUTORIDADE NT[^'"]*|AUTORIT[ÄÉ]T[^'"]*|BUILTIN[^'"]*|Administrators|Administradores|Administratoren|Administrateurs|Everyone|Todos|Jeder|Users|Usu[aá]rios|Usuarios|Benutzer)`
const proibidos = [
  [new RegExp(String.raw`-(?:c|i)?(?:eq|ne|in|notin|like|notlike|match|notmatch|contains|notcontains)\s+@?\(?\s*['"]` + NOMES + `['"]`, 'i'), 'nome localizado de conta/grupo comparado como texto: use o SID (ConvertTo-NextecAccountSid, S-1-5-18, S-1-5-32-544)'],
  [new RegExp(String.raw`@\(\s*['"]` + NOMES + String.raw`['"]\s*,`, 'i'), 'lista de nomes localizados de conta/grupo: use SIDs'],
  [/(?:\bschtasks(?:\.exe)?|\bwmic(?:\.exe)?|\bwhoami(?:\.exe)?|\bnetsh(?:\.exe)?|\bicacls(?:\.exe)?|\bnet(?:\.exe)?\s+(?:user|localgroup|session)|\bsc(?:\.exe)?\s+(?:query|qc)|\bfindstr)\b/i, 'saída textual de utilitário do Windows é localizada: use cmdlet/.NET e propriedades de objeto'],
  [/\.(?:Exception\.)?Message\s+-(?:c|i)?(?:match|like)\s+['"][^'"]*(?:access|denied|negado|not found|cannot|n[aã]o foi|no se|nicht)/i, 'mensagem de erro do Windows/.NET é localizada: decida por HResult/tipo de exceção'],
  [/'\{0:(?:yyyy|HH|MM|dd)[^}]*\}[^']*'\s+-f\s+\(?Get-Date/, 'data formatada com -f usa a cultura do processo: (Get-Date).ToString(fmt, [Globalization.CultureInfo]::InvariantCulture)'],
  [/\.ToString\('(?:yyyy|HH|MM|dd)[^']*'\)/, 'ToString de data sem cultura: passe [Globalization.CultureInfo]::InvariantCulture'],
  [/\[(?:DateTime|datetime)\]::(?:Parse|TryParse)\((?![^)]*InvariantCulture)/, 'Parse de data sem InvariantCulture'],
  [/C:\+Program Files|Arquivos de Programas|C:\+Users\+[A-Za-z]|\Usu[aá]rios\|\+Área de Trabalho/i, 'nome de pasta localizado ou fixo: use [Environment]::GetFolderPath/GetEnvironmentVariable'],
]
const achados = []
for (const f of arquivos.filter(producao)) {
  let n = 0
  for (const l of git('show', ':' + f).toString('utf8').split('\n')) {
    n++
    if (/^\s*(#|\/\/)/.test(l)) continue
    for (const [re, porque] of proibidos) if (re.test(l)) achados.push(`${f}:${n}: ${l.trim().slice(0, 140)}  <- ${porque}`)
  }
}
falha('(e) dependência de texto localizado (nome de conta/grupo, saída de utilitário, mensagem de erro, cultura):', achados,
  'troque por SID, propriedade de objeto, código/HRESULT ou [Globalization.CultureInfo]::InvariantCulture')

if (erros.length) {
  console.error('VERIFICAÇÃO DE INTEGRIDADE FALHOU\n\n' + erros.join('\n\n') + '\n')
  process.exit(1)
}
console.log(`Integridade ok: ${arquivos.length} arquivos, ${patches.length} patches, .ps1 conferidos.`)
