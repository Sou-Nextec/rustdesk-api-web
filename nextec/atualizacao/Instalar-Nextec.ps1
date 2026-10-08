<#
.SYNOPSIS
  Instala e mantém atualizado o app de acesso remoto da Nextec (RustDesk personalizado).

.DESCRIPTION
  Baixa a versão atual do site de atualização, confere o hash SHA-256, instala o MSI em modo
  silencioso e cria uma tarefa agendada que repete a checagem todo dia. O mesmo script serve
  para a primeira instalação e para as atualizações.

.PARAMETER UrlBase
  Endereço do site de atualização (padrão: https://atualizar.nex.tec.br).

.PARAMETER Forcar
  Reinstala mesmo que a versão instalada já seja a atual.

.PARAMETER SoVerificar
  Baixa e confere o hash, mas não instala nada nem cria tarefa (teste).

.PARAMETER Silencioso
  Usado pela tarefa agendada: sem mensagens na tela.
#>
[CmdletBinding()]
param(
  [string]$UrlBase = 'https://atualizar.nex.tec.br',
  [switch]$Forcar,
  [switch]$SoVerificar,
  [switch]$Silencioso
)

$ErrorActionPreference = 'Stop'
$Pasta   = Join-Path $env:ProgramData 'Nextec\Acesso'
$Log     = Join-Path $Pasta 'atualizacao.log'
$Tarefa  = 'Nextec Acesso - Atualizacao'
$ChaveReg = 'HKLM:\SOFTWARE\Nextec\Acesso'

function Escrever([string]$msg) {
  $linha = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg
  if (-not (Test-Path $Pasta)) { New-Item -ItemType Directory -Path $Pasta -Force | Out-Null }
  Add-Content -Path $Log -Value $linha -Encoding UTF8
  if (-not $Silencioso) { Write-Host $linha }
}

try {
  # precisa de administrador para instalar o serviço
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $admin = (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin -and -not $SoVerificar) { throw 'Execute como administrador (botão direito > Executar como administrador).' }

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $UrlBase = $UrlBase.TrimEnd('/')

  # 1. versão publicada
  $resp = Invoke-WebRequest -Uri "$UrlBase/versao.json?t=$([DateTime]::UtcNow.Ticks)" -UseBasicParsing -TimeoutSec 30
  # decodifica como UTF-8 e ignora a marca BOM, que o Windows PowerShell 5.1 coloca ao gravar arquivos
  $texto = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray()).TrimStart([char]0xFEFF)
  $json = $texto | ConvertFrom-Json
  $alvo = $json.windows
  if (-not $alvo -or -not $alvo.versao -or -not $alvo.arquivo -or -not $alvo.sha256) { throw 'versao.json sem a seção windows completa.' }
  Escrever "Versão publicada: $($alvo.versao)"

  # 2. versão instalada (marca gravada por este script)
  $instalada = $null
  if (Test-Path $ChaveReg) { $instalada = (Get-ItemProperty $ChaveReg -ErrorAction SilentlyContinue).Versao }
  if ($instalada) { Escrever "Versão instalada: $instalada" } else { Escrever 'Nada instalado por este script ainda.' }

  $precisa = $Forcar -or (-not $instalada) -or ([version]$alvo.versao -gt [version]$instalada)
  if (-not $precisa) { Escrever 'Já está na versão atual. Nada a fazer.'; return }

  # 3. baixar e conferir
  $tmp = Join-Path $Pasta 'download'
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  $msi = Join-Path $tmp ([IO.Path]::GetFileName($alvo.arquivo))
  Escrever "Baixando $($alvo.arquivo)"
  Invoke-WebRequest -Uri "$UrlBase/$($alvo.arquivo)" -OutFile $msi -UseBasicParsing -TimeoutSec 900
  $hash = (Get-FileHash -Path $msi -Algorithm SHA256).Hash
  if ($hash -ne $alvo.sha256.ToUpper()) {
    Remove-Item $msi -Force -ErrorAction SilentlyContinue
    throw "Hash diferente do publicado (esperado $($alvo.sha256), recebido $hash). Instalação cancelada."
  }
  Escrever 'Hash conferido.'
  if ($SoVerificar) { Escrever 'Modo SoVerificar: nada foi instalado.'; Remove-Item $msi -Force -ErrorAction SilentlyContinue; return }

  # 4. instalar (MSI faz atualização por cima)
  Escrever 'Instalando...'
  $logMsi = Join-Path $Pasta 'msi.log'
  $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', "`"$msi`"", '/qn', '/norestart', '/L*v', "`"$logMsi`"") -Wait -PassThru
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "msiexec terminou com código $($p.ExitCode). Veja $logMsi" }
  if (-not (Test-Path $ChaveReg)) { New-Item -Path $ChaveReg -Force | Out-Null }
  Set-ItemProperty -Path $ChaveReg -Name Versao -Value $alvo.versao
  Escrever "Instalado: $($alvo.versao)"
  Remove-Item $msi -Force -ErrorAction SilentlyContinue

  # 5. tarefa diária de atualização (copia o script para um lugar fixo)
  $meu = $MyInvocation.MyCommand.Path
  $fixo = Join-Path $Pasta 'Instalar-Nextec.ps1'
  if ($meu -and ($meu -ne $fixo)) { Copy-Item -Path $meu -Destination $fixo -Force }
  if (Test-Path $fixo) {
    $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$fixo`" -UrlBase `"$UrlBase`" -Silencioso"
    $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
    $gatilho = New-ScheduledTaskTrigger -Daily -At '12:30'
    $gatilho.RandomDelay = [TimeSpan]::FromHours(2)
    $conf = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilho -Settings $conf `
      -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
    Escrever "Tarefa agendada: $Tarefa (todo dia, perto das 12:30)"
  }
}
catch {
  Escrever "ERRO: $($_.Exception.Message)"
  if (-not $Silencioso) { Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red }
  exit 1
}
