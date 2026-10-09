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
  $svc = Get-CimInstance Win32_Service | Where-Object { $_.PathName -match '--service' -and $_.PathName -match 'Program Files' } | Select-Object -First 1
  if (-not $svc) { throw 'Não encontrei o serviço do RustDesk. Instale o app (instalação completa, não o portátil) ou informe -Exe.' }
  if ($svc.PathName -match '^"([^"]+)"') { return $Matches[1] }
  return ($svc.PathName -split ' --service')[0].Trim()
}

function MeuId {
  if ($Simular) { if (-not $Id) { throw 'No modo -Simular informe -Id.' }; return $Id }
  $saida = & (AcharExe) --get-id 2>&1 | Out-String
  if ($saida -notmatch '(\d{6,})') { throw "Não consegui ler o ID do RustDesk (saída: $saida)." }
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
  $atual = (& (AcharExe) --option $chave 2>&1 | Out-String).Trim()
  if ($atual -ne $valor) { & (AcharExe) --option $chave $valor 2>&1 | Out-Null; Escrever "Opção $chave = $valor" }
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
    $estado = Chamar '/api/nextec/agent/sync' @{ id = $meuId; token = $token }
    if (-not $estado.managed) { return }
    Opcao 'approve-mode' $estado.approve_mode
    Opcao 'verification-method' $estado.verification_method
    if (-not $estado.rotate) { return }

    $nova = SenhaForte
    Chamar '/api/nextec/agent/password' @{ id = $meuId; token = $token; password = $nova } | Out-Null
    if ($Simular) {
      Escrever '[simulação] --password aplicada'
    } else {
      $saida = (& (AcharExe) --password $nova 2>&1 | Out-String).Trim()
      if ($saida) { throw "O RustDesk recusou a senha: $saida" }
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
