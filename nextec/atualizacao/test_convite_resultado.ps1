#requires -version 5.1
<#
Resultado do convite de instalacao no agente: 409 (a maquina ja pertence a outro cliente) e 403 (convite recusado) NAO apagam
convite.json; o motivo vai para convite-resultado.json e para o log, e a nova tentativa so ocorre depois de 6 h. 200 apaga o
convite. Erro temporario e convite com mais de 72 h seguem o comportamento anterior. Sem administrador, ACL e log protegido
sao duplas simples; o resto (DPAPI do token, leitura/escrita do JSON, regras de tempo) e o codigo real.
#>
[CmdletBinding()]
param([string]$InstallDir)
$ErrorActionPreference = 'Stop'
if (-not $InstallDir) { $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$provisioner = Join-Path $InstallDir 'Provisionar-Agente-Nextec.ps1'
if (-not (Test-Path -LiteralPath $provisioner -PathType Leaf)) { throw "Provisioner not found in $InstallDir" }
function Assert($value, [string]$message) { if (-not $value) { throw "ASSERT: $message" } }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

. $provisioner 6>$null | Out-Null
$script:NextecProvisionScriptRoot = $InstallDir
$script:NextecPainelFixo = 'https://painel-remoto.nex.tec.br'
if (-not $isAdmin) {
  function Initialize-NextecProvisionDirectory { param($Root) New-Item -ItemType Directory -Path $Root -Force | Out-Null }
  function Assert-NextecProvisionPath { param($Path) }
  function Assert-NextecProvisionFileAcl { param($Path) }
  function Write-NextecProvisionLog { param($Code,$Root) Add-Content -LiteralPath (Get-NextecProvisionPaths -Root $Root).Log -Value ([string]$Code) -Encoding UTF8 }
  function Write-NextecProtectedJson { param($Path,$Value) $Value | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $Path -Encoding UTF8 }
}

$work = Join-Path ([IO.Path]::GetTempPath()) ('nextec-convite-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$code = 'K7M2QX9P4TA8B3C5D6E2'
$now = [DateTime]::UtcNow
try {
  function New-Root([DateTime]$created) {
    $root = Join-Path $work ([Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $paths = Get-NextecProvisionPaths -Root $root
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '123456789' -Token ('A' * 43)
    ([pscustomobject]@{ codigo = $code; criado_utc = $created.ToString('o') } | ConvertTo-Json -Compress) | Set-Content -LiteralPath $paths.Invite -Encoding UTF8
    $root
  }
  function Log-Of($root) { $l = (Get-NextecProvisionPaths -Root $root).Log; if (Test-Path -LiteralPath $l) { Get-Content -LiteralPath $l -Raw } else { '' } }
  $calls = [hashtable]::Synchronized(@{ n = 0; status = 200 })
  $post = { param($panel, $body) $calls.n++; $calls.status }

  # 409: conflito. Mantem o convite, grava o motivo e o log, espera 6 h
  $root = New-Root $now; $paths = Get-NextecProvisionPaths -Root $root
  $calls.status = 409; $calls.n = 0
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now) -eq 'conflict') '409 deve devolver conflict'
  Assert (Test-Path -LiteralPath $paths.Invite) 'convite.json nao pode ser apagado no 409'
  $res = Get-Content -LiteralPath $paths.InviteResult -Raw | ConvertFrom-Json
  Assert ($res.estado -eq 'conflito' -and $res.http -eq 409) 'resultado do conflito gravado'
  Assert ((Log-Of $root) -match 'invite_conflict') 'log invite_conflict'
  Assert ($calls.n -eq 1) 'uma chamada'
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now.AddHours(1)) -eq 'waiting_retry') 'dentro das 6 h nao repete'
  Assert ($calls.n -eq 1) 'sem nova chamada na espera'
  # o admin resolveu: depois das 6 h o agente tenta de novo e conclui
  $calls.status = 200
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now.AddHours(7)) -eq 'claimed') 'apos 6 h repete e vincula'
  Assert (-not (Test-Path -LiteralPath $paths.Invite)) '200 apaga o convite'
  $res = Get-Content -LiteralPath $paths.InviteResult -Raw | ConvertFrom-Json
  Assert ($res.estado -eq 'vinculado') 'resultado vinculado'
  Assert ((Log-Of $root) -match 'invite_claimed') 'log invite_claimed'

  # 403: convite recusado. Mantem o convite
  $root = New-Root $now; $paths = Get-NextecProvisionPaths -Root $root
  $calls.status = 403
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now) -eq 'rejected') '403 deve devolver rejected'
  Assert (Test-Path -LiteralPath $paths.Invite) 'convite.json nao pode ser apagado no 403'
  $res = Get-Content -LiteralPath $paths.InviteResult -Raw | ConvertFrom-Json
  Assert ($res.estado -eq 'recusado' -and $res.http -eq 403) 'resultado do convite recusado'
  Assert ((Log-Of $root) -match 'invite_rejected') 'log invite_rejected'
  Assert ($res.codigo -ceq $code) 'resultado guarda o codigo do convite'
  # convite novo (outro MSI) dentro das 6 h: a espera do convite anterior nao vale para ele
  $novo = 'Q8R3T5V7W9X2Y4Z6A3B5'
  ([pscustomobject]@{ codigo = $novo; criado_utc = $now.ToString('o') } | ConvertTo-Json -Compress) | Set-Content -LiteralPath $paths.Invite -Encoding UTF8
  $calls.status = 200; $calls.n = 0
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now.AddHours(1)) -eq 'claimed') 'convite novo tenta na hora'
  Assert ($calls.n -eq 1) 'convite novo chamou o painel'
  # resultado sem codigo (agente antigo) nao segura o convite atual
  $root = New-Root $now; $paths = Get-NextecProvisionPaths -Root $root
  Write-NextecProtectedJson -Path $paths.InviteResult -Value ([pscustomobject]@{ estado = 'recusado'; http = 403; em_utc = $now.ToString('o'); proxima_utc_ticks = $now.AddHours(6).Ticks })
  $calls.n = 0
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now.AddHours(1)) -eq 'claimed') 'resultado sem codigo nao bloqueia'
  Assert ($calls.n -eq 1) 'chamou o painel'

  # erro temporario: tenta de novo no proximo ciclo, sem resultado gravado
  $root = New-Root $now; $paths = Get-NextecProvisionPaths -Root $root
  $calls.status = 500
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now) -eq 'retry') '500 deve devolver retry'
  Assert ((Test-Path -LiteralPath $paths.Invite) -and -not (Test-Path -LiteralPath $paths.InviteResult)) '500 nao grava resultado nem apaga'
  $calls.n = 0
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now.AddMinutes(30)) -eq 'retry') 'sem resultado definitivo repete no ciclo seguinte'
  Assert ($calls.n -eq 1) 'repetiu'

  # convite com mais de 72 h: descartado como antes
  $root = New-Root $now.AddHours(-80); $paths = Get-NextecProvisionPaths -Root $root
  Assert ((Invoke-NextecInviteClaim -Root $root -PostInvite $post -Now $now) -eq 'discarded') '72 h descarta'
  Assert (-not (Test-Path -LiteralPath $paths.Invite)) 'convite velho apagado'

  # codigos novos pertencem a lista unica do log
  foreach ($c in 'invite_conflict', 'invite_rejected') { Assert ((ConvertTo-NextecProvisionLogLine -Code $c) -ceq $c) "codigo $c na lista" }
  'OK test_convite_resultado'
} finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
