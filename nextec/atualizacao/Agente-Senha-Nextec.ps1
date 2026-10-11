<#
.SYNOPSIS
  Agente de senha automática do acesso remoto Nextec (RustDesk), para servidores e máquinas marcadas no painel.

.DESCRIPTION
  -Instalar: cadastra a máquina no painel (usa a chave de cadastro que o admin gera em Segurança > Senhas dos servidores),
             guarda o token protegido e cria a tarefa agendada (SYSTEM, a cada 5 minutos).
  -Executar: uma verificação (o que a tarefa roda). Pergunta ao painel se a máquina é gerenciada e se é hora de trocar a
             senha. Se for, gera uma senha forte, envia ao painel como pendente, aplica no RustDesk (--password) e só então
             confirma. Se aplicar falhar, não confirma e a senha anterior continua valendo no painel.

  A senha é permanente do RustDesk: serve só para liberar a conexão pelo RustDesk. Não é a senha do Windows.

.PARAMETER Painel
  Endereço do painel (ex.: https://painel-remoto.nex.tec.br).
.PARAMETER ChaveAgente
  Chave de cadastro gerada no painel (só no -Instalar).
.PARAMETER Simular
  Teste: não mexe no RustDesk nem cria tarefa; usa -Id e -PastaDados.
#>
[CmdletBinding()]
param(
  [switch]$Instalar,
  [switch]$Executar,
  [string]$Painel,
  [string]$ChaveAgente,
  [string]$Exe,
  [switch]$Simular,
  [string]$Id,
  [string]$PastaDados = (Join-Path $env:ProgramData 'Nextec\Acesso')
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Config = Join-Path $PastaDados 'agente-senha.json'
$Log    = Join-Path $PastaDados 'agente-senha.log'
$Tarefa = 'Nextec Acesso - Senha'
Add-Type -AssemblyName System.Security

function Escrever([string]$msg) {
  if (-not (Test-Path $PastaDados)) { New-Item -ItemType Directory -Path $PastaDados -Force | Out-Null }
  if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 1MB) { Move-Item $Log "$Log.antigo" -Force }
  Add-Content -Path $Log -Value ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg) -Encoding UTF8
  if ($Instalar -or $VerbosePreference -ne 'SilentlyContinue' -or $Simular) { Write-Host $msg }
}

function Chamar([string]$caminho, [hashtable]$corpo) {
  $r = Invoke-WebRequest -Uri ($script:PainelUrl + $caminho) -Method Post -ContentType 'application/json' `
        -Body ($corpo | ConvertTo-Json -Compress) -UseBasicParsing -TimeoutSec 30
  return ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()).TrimStart([char]0xFEFF) | ConvertFrom-Json)
}

function Proteger([string]$texto) {
  $b = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($texto), $null, 'LocalMachine')
  return [Convert]::ToBase64String($b)
}
function Revelar([string]$b64) {
  $b = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($b64), $null, 'LocalMachine')
  return [Text.Encoding]::UTF8.GetString($b)
}

function AcharExe {
  if ($Exe) { return $Exe }
  $svc = Get-CimInstance Win32_Service | Where-Object { $_.PathName -match '--service' -and $_.PathName -match 'Program Files' } |
    Sort-Object @{ Expression = { if ($_.Name -match '^RustDesk$') { 0 } else { 1 } } }, Name | Select-Object -First 1
  if (-not $svc) { throw 'Não encontrei o serviço do RustDesk. Instale o app (instalação completa, não o portátil) ou informe -Exe.' }
  if ($svc.PathName -match '^"([^"]+)"') { return $Matches[1] }
  return ($svc.PathName -split ' --service')[0].Trim()
}

function PastaAppDataServico {
  if ($Simular -and $env:NX_TEST_RUSTDESK_APPDATA) { return $env:NX_TEST_RUSTDESK_APPDATA }
  $svc = Get-CimInstance Win32_Service | Where-Object { $_.PathName -match '--service' -and $_.PathName -match 'Program Files' } |
    Sort-Object @{ Expression = { if ($_.Name -match '^RustDesk$') { 0 } else { 1 } } }, Name | Select-Object -First 1
  if (-not $svc) { throw 'Não encontrei o serviço do RustDesk para localizar o perfil que contém o ID ativo.' }

  $conta = ([string]$svc.StartName).Trim().ToLowerInvariant()
  $raiz = if ($conta -match '^(localservice|nt authority\\localservice)$') {
    Join-Path $env:WinDir 'ServiceProfiles\LocalService\AppData\Roaming'
  } elseif ($conta -match '^(localsystem|nt authority\\system|system)$') {
    Join-Path $env:WinDir 'System32\config\systemprofile\AppData\Roaming'
  } elseif ($conta -match '^(networkservice|nt authority\\networkservice)$') {
    Join-Path $env:WinDir 'ServiceProfiles\NetworkService\AppData\Roaming'
  } else {
    throw "A conta do serviço RustDesk ('$($svc.StartName)') não é reconhecida. O agente parou para não cadastrar outro ID."
  }

  $config = Join-Path $raiz 'RustDesk\config'
  if (-not (Test-Path (Join-Path $config 'RustDesk2.toml')) -and -not (Test-Path (Join-Path $config 'RustDesk.toml'))) {
    throw "O perfil do serviço RustDesk ainda não tem configuração em '$config'. Abra o Nextec-Connect uma vez e tente novamente; nenhum ID alternativo foi cadastrado."
  }
  return $raiz
}

function InvocarRustDesk([string[]]$Argumentos) {
  $caminho = AcharExe
  $appDataAnterior = $env:APPDATA
  try {
    # RustDesk instalado guarda a identidade atendida pelo serviço no perfil do serviço,
    # diferente do perfil do administrador que executa o instalador do agente.
    $env:APPDATA = PastaAppDataServico
    $saida = & $caminho @Argumentos 2>&1
    $codigo = $LASTEXITCODE
  } finally {
    $env:APPDATA = $appDataAnterior
  }
  return [pscustomobject]@{ ExitCode = $codigo; Output = (@($saida) -join "`n").Trim() }
}

function MeuId {
  if ($Simular -and -not $Exe) { if (-not $Id) { throw 'No modo -Simular informe -Id.' }; return $Id }
  $r = InvocarRustDesk -Argumentos @('--get-id')
  if ($r.ExitCode -ne 0) { throw "O RustDesk não conseguiu ler o ID do serviço (código $($r.ExitCode)): $($r.Output)" }
  if ($r.Output -notmatch '(\d{6,})') { throw "Não consegui ler o ID ativo do serviço RustDesk (saída: $($r.Output))." }
  return $Matches[1]
}

function SenhaForte {
  $letras = [char[]]('abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789')
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $letras[$_ % $letras.Length] })
}

function Opcao([string]$chave, [string]$valor) {
  if ($Simular) { Escrever "[simulação] --option $chave $valor"; return }
  $consulta = InvocarRustDesk -Argumentos @('--option', $chave)
  if ($consulta.ExitCode -ne 0) { throw "O RustDesk não conseguiu consultar '$chave' (código $($consulta.ExitCode)): $($consulta.Output)" }
  if ($consulta.Output -ne $valor) {
    $alteracao = InvocarRustDesk -Argumentos @('--option', $chave, $valor)
    if ($alteracao.ExitCode -ne 0) { throw "O RustDesk não conseguiu aplicar '$chave' (código $($alteracao.ExitCode)): $($alteracao.Output)" }
    Escrever "Opção $chave = $valor"
  }
}

if ($Instalar) {
  if (-not $Painel -or -not $ChaveAgente) { throw 'Informe -Painel e -ChaveAgente.' }
  if (-not $Simular) {
    $admin = (New-Object Security.Principal.WindowsPrincipal ([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { throw 'Execute como administrador.' }
  }
  $script:PainelUrl = $Painel.TrimEnd('/')
  $meuId = MeuId
  Escrever "ID do RustDesk: $meuId"
  try {
    $r = Chamar '/api/nextec/agent/enroll' @{ key = $ChaveAgente; id = $meuId }
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    if ($code -eq 409) { throw 'Esta máquina já está cadastrada. Peça ao administrador para usar "Remover agente" no painel e rode de novo.' }
    if ($code -eq 401) { throw 'Chave de cadastro recusada. Gere uma nova no painel.' }
    throw
  }
  New-Item -ItemType Directory -Path $PastaDados -Force | Out-Null
  @{ painel = $script:PainelUrl; id = $meuId; token = (Proteger $r.token) } | ConvertTo-Json | Set-Content -Path $Config -Encoding UTF8
  if (-not $Simular) {
    & icacls.exe $Config /inheritance:r /grant:r 'SYSTEM:(F)' 'Administrators:(F)' | Out-Null
    $copia = Join-Path $PastaDados 'Agente-Senha-Nextec.ps1'
    if ($MyInvocation.MyCommand.Path -ne $copia) { Copy-Item $MyInvocation.MyCommand.Path $copia -Force }
    $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$copia`" -Executar"
    if ($Exe) { $arg += " -Exe `"$Exe`"" }
    $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
    $gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
    $conf = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilho -Settings $conf -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
    Escrever "Tarefa agendada criada: $Tarefa (a cada 5 minutos)"
    Start-ScheduledTask -TaskName $Tarefa
    Escrever 'Primeira sincronização iniciada imediatamente.'
  }
  Escrever 'Cadastro concluído. Ligue a senha automática desta máquina (ou do grupo) no painel.'
  return
}

if ($Executar) {
  try {
    $cfg = Get-Content $Config -Raw | ConvertFrom-Json
    $script:PainelUrl = $cfg.painel
    $token = Revelar $cfg.token
    $meuId = $cfg.id
    $idServico = MeuId
    if ($idServico -ne $meuId) {
      throw "O agente está vinculado ao ID $meuId, mas o serviço RustDesk atende o ID $idServico. A execução foi interrompida para não trocar a senha da máquina errada. Remova o agente antigo no painel e cadastre novamente para vincular o ID do serviço."
    }
    $estado = Chamar '/api/nextec/agent/sync' @{ id = $meuId; token = $token }
    if (-not $estado.managed) { return }
    Opcao 'approve-mode' $estado.approve_mode
    Opcao 'verification-method' $estado.verification_method
    if (-not $estado.rotate) { return }

    $nova = SenhaForte
    Chamar '/api/nextec/agent/password' @{ id = $meuId; token = $token; password = $nova } | Out-Null
    if ($Simular -and -not $Exe) {
      Escrever '[simulação] --password aplicada'
    } else {
      $aplicacao = InvocarRustDesk -Argumentos @('--password', $nova)
      if ($aplicacao.ExitCode -ne 0) {
        $detalhe = if ($aplicacao.Output) { ": $($aplicacao.Output)" } else { '' }
        throw "O RustDesk recusou a senha (código $($aplicacao.ExitCode))$detalhe"
      }
    }
    Chamar '/api/nextec/agent/confirm' @{ id = $meuId; token = $token } | Out-Null
    Escrever 'Senha trocada e confirmada.'
  } catch {
    Escrever "ERRO: $($_.Exception.Message)"
    exit 1
  }
  return
}

Write-Host 'Use -Instalar -Painel <url> -ChaveAgente <chave>  (como administrador)  ou -Executar.'

