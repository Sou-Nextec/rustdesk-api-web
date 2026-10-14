#requires -version 5.1
<#
.SYNOPSIS
  Diagnóstico somente leitura do acesso Nextec nesta máquina: serviço do RustDesk, agente, tarefas, logs e conexão com o painel.

.DESCRIPTION
  Não altera nada, não envia nada e não mostra segredos (token, chave de inscrição e senhas nunca são lidos nem impressos).
  Mostra o que existe, o estado de cada peça e, no fim, o que fazer. Rode como administrador para ver tudo:

    powershell -NoProfile -ExecutionPolicy Bypass -File Diagnostico-Agente-Nextec.ps1

  A saída também vai para um arquivo de texto (padrão: na pasta TEMP), que pode ser enviado ao suporte.

.PARAMETER Saida
  Arquivo de texto para gravar o relatório. Padrão: %TEMP%\diagnostico-nextec-<máquina>.txt
.PARAMETER Painel
  Endereço https do painel para testar a conexão. Padrão: o painel gravado em inscricao.json.
#>
[CmdletBinding()]
param(
  [string]$Saida = '',
  [string]$Painel = '',
  [string]$PastaDados = (Join-Path $env:ProgramData 'Nextec\Acesso')
)

$ErrorActionPreference = 'Continue'
if (-not $Saida) { $Saida = Join-Path $env:TEMP ('diagnostico-nextec-' + $env:COMPUTERNAME + '.txt') }
$script:linhas = New-Object System.Collections.ArrayList
$script:alertas = New-Object System.Collections.ArrayList
$script:ok = New-Object System.Collections.ArrayList

function Say([string]$texto = '') { [void]$script:linhas.Add($texto); Write-Host $texto }
function Titulo([string]$texto) { Say ''; Say ('== ' + $texto) }
function Alerta([string]$texto) { [void]$script:alertas.Add($texto) }
function Bom([string]$texto) { [void]$script:ok.Add($texto) }

# Linha de log sem nada que pareça segredo (os logs do agente não gravam, isto é só cinto e suspensório).
function Limpar([string]$linha) {
  $linha = [regex]::Replace($linha, '(?i)(token|senha|password|chave|key|bootstrap)(["'':= ]+)[^\s",;]{8,}', '$1$2***')
  return $linha
}

function UltimasLinhas([string]$arquivo, [int]$n = 8) {
  if (-not (Test-Path -LiteralPath $arquivo -PathType Leaf)) { Say "  (sem $([IO.Path]::GetFileName($arquivo)))"; return @() }
  $info = Get-Item -LiteralPath $arquivo
  Say ("  $($info.Name): $([math]::Round($info.Length / 1KB, 1)) KB, último registro em $($info.LastWriteTime.ToString('dd/MM/yyyy HH:mm'))")
  $tail = @(Get-Content -LiteralPath $arquivo -Tail $n -ErrorAction SilentlyContinue)
  foreach ($l in $tail) { Say ('    ' + (Limpar $l)) }
  return $tail
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Titulo 'Sistema'
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
Say ("  Máquina: $env:COMPUTERNAME")
Say ("  Windows: $($os.Caption) $($os.Version)  (idioma $((Get-Culture).Name))")
Say ("  PowerShell: $($PSVersionTable.PSVersion)   Administrador: $admin")
Say ("  Data e hora local: $((Get-Date).ToString('dd/MM/yyyy HH:mm:ss'))  Fuso: $((Get-TimeZone).Id)")
if (-not $admin) { Alerta 'Executado sem administrador: pastas do serviço e algumas tarefas podem não aparecer. Rode de novo como administrador.' }
if ($PSVersionTable.PSVersion.Major -lt 5) { Alerta 'PowerShell abaixo de 5.1: o agente exige o Windows Management Framework 5.1.' }

Titulo 'Serviço do RustDesk / Nextec Connect'
$servicos = @()
try { $servicos = @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { [string]$_.PathName -match '(?i)(^|\s)--service(\s|$)' }) } catch { Alerta 'Não foi possível listar os serviços.' }
$nossos = @()
foreach ($s in $servicos) {
  $caminho = ''
  if ([string]$s.PathName -match '^\s*"([^"]+\.exe)"') { $caminho = $Matches[1] } elseif ([string]$s.PathName -match '^\s*(\S.*?\.exe)(\s|$)') { $caminho = $Matches[1] }
  $existe = [bool]($caminho -and (Test-Path -LiteralPath $caminho -PathType Leaf))
  $nome = if ($caminho) { [IO.Path]::GetFileNameWithoutExtension($caminho) } else { '' }
  $roots = @(
    (Join-Path $env:WinDir 'ServiceProfiles\LocalService\AppData\Roaming'),
    (Join-Path $env:WinDir 'System32\config\systemprofile\AppData\Roaming'),
    (Join-Path $env:WinDir 'ServiceProfiles\NetworkService\AppData\Roaming')
  )
  $configs = @()
  foreach ($r in $roots) {
    $c = Join-Path (Join-Path $r $nome) 'config'
    $visivel = $false
    try { $visivel = Test-Path -LiteralPath $c -PathType Container } catch { }
    if ($visivel) { $configs += $c }
  }
  Say ("  $($s.Name)  estado=$($s.State)  conta=$($s.StartName)")
  Say ("    executável: $caminho  (existe: $existe)")
  if ($existe) { Say ("    versão: $((Get-Item -LiteralPath $caminho).VersionInfo.FileVersion)") }
  if ($configs.Count) { foreach ($c in $configs) { Say "    config: $c" } } else { Say '    config: nenhuma pasta de configuração encontrada (ou sem permissão para ver)' }
  # So e RustDesk/Nextec quem tem configuracao .toml do RustDesk ou e o app do marcador do instalador (AnyDesk, TeamViewer e
  # outros tambem tem servico com --service e nao podem ser tratados como este cliente).
  $marcaApp = ''
  try { $marcaApp = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Nextec\Agente' -ErrorAction Stop).AppName } catch { }
  $temToml = $false
  foreach ($c in $configs) { if (@(Get-ChildItem -LiteralPath $c -File -Filter '*.toml' -ErrorAction SilentlyContinue).Count) { $temToml = $true } }
  $descricao = ''
  if ($existe) { $descricao = [string](Get-Item -LiteralPath $caminho).VersionInfo.FileDescription + ' ' + [string](Get-Item -LiteralPath $caminho).VersionInfo.ProductName }
  $ehRustDesk = $temToml -or ($marcaApp -and $marcaApp -ieq $nome) -or ($descricao -match '(?i)rustdesk')
  $eh = ($nome -and ([string]$s.Name -ieq $nome) -and $existe -and $ehRustDesk)
  if (-not $ehRustDesk) { Say '    (não é RustDesk/Nextec Connect: ignorado)' }
  if ($eh) { $nossos += [pscustomobject]@{ Servico = $s; Exe = $caminho; Nome = $nome } }
}
if (-not $nossos.Count) { Alerta 'Nenhum serviço RustDesk/Nextec Connect instalado. Instale o app gerado pelo painel.' }
elseif ($nossos.Count -gt 1) { Alerta ("Mais de um serviço RustDesk ($(($nossos | ForEach-Object { $_.Servico.Name }) -join ', ')). O agente usa o marcador do instalador para escolher; confira a seção Marcador.") }
else {
  if ($nossos[0].Servico.State -ne 'Running') { Alerta 'O serviço do RustDesk não está em execução.' } else { Bom 'Serviço do RustDesk em execução.' }
  $id = ''
  try {
    $textoId = (& $nossos[0].Exe --get-id 2>&1 | Out-String).Trim()
    $ultima = @($textoId -split "`r?`n" | Where-Object { $_ })[-1]
    if ($ultima -match '^\d{6,}$') { $id = $ultima }
  } catch { }
  if ($id) { Say ("  ID desta máquina: $id"); Bom "ID do RustDesk lido: $id." } else { Alerta 'Não foi possível ler o ID do RustDesk (--get-id).' }
}

Titulo 'Marcador do instalador'
try {
  $reg = Get-ItemProperty 'HKLM:\SOFTWARE\Nextec\Agente' -ErrorAction Stop
  Say "  HKLM\SOFTWARE\Nextec\Agente: AppName=$($reg.AppName)  InstallDir=$($reg.InstallDir)"
  Bom 'Marcador do instalador presente.'
} catch { Say '  HKLM\SOFTWARE\Nextec\Agente: ausente'; Alerta 'Sem marcador do instalador: o app foi instalado por um instalador antigo (sem o agente). Instale o app gerado pelo painel por cima.' }
try {
  $acesso = Get-ItemProperty 'HKLM:\SOFTWARE\Nextec\Acesso' -ErrorAction Stop
  Say "  HKLM\SOFTWARE\Nextec\Acesso: Versao=$($acesso.Versao)"
} catch { Say '  HKLM\SOFTWARE\Nextec\Acesso: ausente' }

Titulo "Arquivos do agente ($PastaDados)"
$temPasta = Test-Path -LiteralPath $PastaDados -PathType Container
if (-not $temPasta) { Say '  pasta ausente'; Alerta 'A pasta do agente não existe: o agente não foi instalado nesta máquina.' }
else {
  foreach ($f in @(Get-ChildItem -LiteralPath $PastaDados -File -ErrorAction SilentlyContinue | Sort-Object Name)) {
    Say ("  {0,-40} {1,9} bytes  {2}" -f $f.Name, $f.Length, $f.LastWriteTime.ToString('dd/MM/yyyy HH:mm'))
  }
  $tem = { param($n) Test-Path -LiteralPath (Join-Path $PastaDados $n) -PathType Leaf }
  foreach ($n in @('Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1')) {
    if (-not (& $tem $n)) { Alerta "Falta ${n} em ${PastaDados}: o instalador do agente não foi aplicado (instale o app gerado pelo painel)." }
  }
  if (& $tem 'bootstrap.json') { Alerta 'Existe um bootstrap.json parado (autorização do painel ainda não consumida). Se for antigo, o agente o descarta no próximo ciclo.' }
  if (& $tem 'agente-senha.json.anterior') { Say '  (existe agente-senha.json.anterior: uma credencial antiga foi aposentada e o cadastro foi refeito)' }
  if (& $tem 'agente-senha.json') { Bom 'Credencial do agente presente.' }
  elseif (& $tem 'inscricao.json') { Say '  Sem agente-senha.json: ainda não inscrita (ou em espera).' }
  else { Alerta 'Sem inscricao.json: o instalador foi gerado sem a chave de inscrição. Gere um instalador novo pelo painel.' }
}

Titulo 'Inscrição'
$painelUrl = $Painel
$insc = Join-Path $PastaDados 'inscricao.json'
if (Test-Path -LiteralPath $insc -PathType Leaf) {
  try {
    $j = [IO.File]::ReadAllText($insc, [Text.Encoding]::UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json
    $tipo = if ([string]$j.chave -like 'nx2.*') { 'por cliente (entra aprovada no cliente)' } elseif ([string]$j.chave -like 'nx1.*') { 'geral (entra em Pendentes)' } else { 'formato desconhecido' }
    Say ("  painel: $($j.painel)   credencial: $tipo")
    if (-not $painelUrl) { $painelUrl = [string]$j.painel }
  } catch { Alerta 'inscricao.json ilegível.' }
} else { Say '  inscricao.json ausente' }
$estado = Join-Path $PastaDados 'inscricao-estado.json'
if (Test-Path -LiteralPath $estado -PathType Leaf) {
  try {
    $e = [IO.File]::ReadAllText($estado, [Text.Encoding]::UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json
    Say ("  estado da inscrição: $($e.state)   tentativas: $($e.attempts)")
    if ($e.state -eq 'manual') { Alerta 'A inscrição foi recusada pelo painel (chave girada, máquina removida ou pendência antiga). Ela tenta de novo a cada 6 horas; para resolver já, gere um instalador novo.' }
    if ($e.state -eq 'blocked') { Alerta 'Esta máquina está bloqueada no painel (Segurança > Bloqueios).' }
  } catch { }
}

Titulo 'Tarefas agendadas'
foreach ($t in @('Nextec Acesso - Cadastro de agente', 'Nextec Acesso - Senha', 'Nextec Acesso - Atualizacao')) {
  $tarefa = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  if (-not $tarefa) {
    Say "  $t : ausente"
    if ($t -ne 'Nextec Acesso - Senha') { Alerta "Tarefa '$t' ausente: reinstale o app gerado pelo painel." }
    continue
  }
  $info = Get-ScheduledTaskInfo -TaskName $t -ErrorAction SilentlyContinue
  $ultimo = if ($info -and $info.LastRunTime -and $info.LastRunTime.Year -gt 2000) { $info.LastRunTime.ToString('dd/MM HH:mm') } else { 'nunca' }
  Say ("  {0}: {1}, última execução {2}, resultado {3}" -f $t, $tarefa.State, $ultimo, $(if ($info) { $info.LastTaskResult } else { '?' }))
  if ([string]$tarefa.State -eq 'Disabled') { Alerta "Tarefa '$t' está desabilitada." }
}

Titulo 'Logs (últimas linhas)'
$logAgente = UltimasLinhas (Join-Path $PastaDados 'agente-senha.log')
$logProv = UltimasLinhas (Join-Path $PastaDados 'provisionamento-agente.log')
$logCoord = UltimasLinhas (Join-Path $PastaDados 'coordenador.log')
$logAtu = UltimasLinhas (Join-Path $PastaDados 'atualizacao.log')
$todos = (@($logAgente) + @($logProv) + @($logCoord)) -join "`n"
if ($todos -match '\(401\)') { Alerta 'O painel recusa a credencial do agente (401). O agente a aposenta sozinho depois de 3 ciclos e refaz o cadastro; se persistir, gere um instalador novo.' }
if ($todos -match 'identity_conflict') { Alerta 'identity_conflict: o agente não achou o serviço RustDesk ou o ID mudou. Veja a seção do serviço acima.' }
if ($todos -match 'unsafe_path') { Alerta 'unsafe_path: permissão da pasta do agente fora do padrão. Reinstale o app gerado pelo painel (ele corrige).' }
if ($todos -match 'invalid_panel') { Alerta 'invalid_panel: o endereço do painel no instalador não é aceito (precisa ser https://dominio, sem porta nem caminho).' }
if ($todos -match 'network_retry') { Alerta 'network_retry: a máquina não está alcançando o painel (rede, proxy ou firewall). Veja o teste de conexão abaixo.' }
if ($todos -match 'peer_not_registered') { Alerta 'peer_not_registered: o RustDesk ainda não se registrou no painel (sem heartbeat). Confira o servidor de ID e a rede.' }
if ($todos -match 'self_enrolled|complete') { Bom 'Inscrição concluída no painel.' }

Titulo 'Conexão com o painel'
if ($painelUrl -match '^https://[A-Za-z0-9.-]+/?$') {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $inicio = Get-Date
    $r = Invoke-WebRequest -Uri $painelUrl -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
    $resp = $r
  } catch {
    $resp = $null
    if ($_.Exception.Response) { $resp = $_.Exception.Response }
    else { Say ("  falha ao conectar em ${painelUrl}: $($_.Exception.Message)"); Alerta 'Não foi possível conectar ao painel por HTTPS (DNS, firewall, proxy ou TLS 1.2).' }
  }
  if ($resp) {
    $codigo = [int]$resp.StatusCode
    Say ("  $painelUrl respondeu HTTP $codigo")
    Bom 'Painel alcançável por HTTPS.'
    $data = $null
    try { $data = $resp.Headers['Date'] } catch { }
    if ($data) {
      $remoto = [DateTime]::MinValue
      if ([DateTime]::TryParse([string]$data, [ref]$remoto)) {
        $dif = [math]::Abs(($remoto.ToUniversalTime() - [DateTime]::UtcNow).TotalMinutes)
        Say ("  diferença de relógio com o painel: {0:N1} minutos" -f $dif)
        if ($dif -gt 5) { Alerta 'Relógio da máquina difere mais de 5 minutos do painel: a verificação de atualização assinada recusa o manifesto.' }
      }
    }
  }
} else { Say '  (sem endereço de painel para testar; informe -Painel https://...)' }

Titulo 'Sessão remota'
$sessao = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { [string]$_.CommandLine -match '(?i)\s--cm(-no-ui)?(\s|"|$)' })
if ($sessao.Count) { Say '  Há uma sessão remota em andamento agora (atualizações ficam para depois).' } else { Say '  Nenhuma sessão remota agora.' }

Titulo 'Resumo'
if ($script:alertas.Count -eq 0) { Say '  Nenhum problema encontrado.' }
else { foreach ($a in $script:alertas) { Say ('  [ATENÇÃO] ' + $a) } }
foreach ($b in $script:ok) { Say ('  [ok] ' + $b) }

try { [IO.File]::WriteAllLines($Saida, [string[]]$script:linhas, (New-Object Text.UTF8Encoding($true))); Write-Host ''; Write-Host "Relatório gravado em: $Saida" } catch { Write-Host "Não foi possível gravar $Saida" }
if ($script:alertas.Count) { exit 1 } else { exit 0 }
