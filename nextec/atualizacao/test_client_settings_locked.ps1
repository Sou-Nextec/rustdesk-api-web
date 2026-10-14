#requires -version 5.1
<#
Cliente gerado com "Bloquear configurações" (disable-settings=Y): no RustDesk 1.5.0 o `--password` e o `--option`
respondem "Settings are disabled!" com código 0. O agente REAL (Agente-Senha-Nextec.ps1) fala com um executável
dublê de verdade (GUI compilado na hora) e um painel falso em memória, e precisa:
  - classificar como client_settings_locked (não password_apply_failed) e escrever a orientação clara no log;
  - não repetir a tentativa a cada rodada (espera de 6 h), mantendo o sync com o painel;
  - tentar de novo quando a espera vence ou logo que o executável muda (instalado por cima).

  -InstallDir  pasta com Agente-Senha-Nextec.ps1 (padrão: esta pasta)
#>
[CmdletBinding()]
param([string]$InstallDir)
$ErrorActionPreference = 'Stop'
if (-not $InstallDir) { $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
function Assert($value, [string]$message) { if (-not $value) { throw "ASSERT: $message" } }
Add-Type -AssemblyName System.Security

$agentScript = Join-Path $InstallDir 'Agente-Senha-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($agentScript, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw "Agente-Senha-Nextec.ps1 nao compilou: $($errors[0].Message)" }
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  . ([scriptblock]::Create($definition.Extent.Text))
}

$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'compilador C# indisponivel (necessario para o executavel duble)' }
$work = Join-Path ([IO.Path]::GetTempPath()) ('nextec-locked-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  # Duble do cliente: GUI (winexe) como o RustDesk. Modo em mode.txt ao lado: 'locked' responde como disable-settings=Y.
  $cs = Join-Path $work 'fake.cs'
  [IO.File]::WriteAllText($cs, @'
using System;
using System.IO;
internal static class Fake {
    private static int Main(string[] args) {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string mode = File.ReadAllText(Path.Combine(dir, "mode.txt")).Trim();
        File.AppendAllText(Path.Combine(dir, "calls.txt"), String.Join(" ", args.Length > 0 ? args[0] : "") + "\n");
        if (args.Length > 0 && args[0] == "--get-id") { Console.Out.WriteLine("536822159"); return 0; }
        if (args.Length > 0 && (args[0] == "--password" || args[0] == "--option")) {
            if (mode == "locked") { Console.Out.WriteLine("Settings are disabled!"); return 0; }
            if (args[0] == "--password") { Console.Out.WriteLine("Done!"); }
            return 0;
        }
        return 0;
    }
}
'@)
  $clientDir = Join-Path $work 'cliente'
  New-Item -ItemType Directory -Path $clientDir | Out-Null
  $fakeExe = Join-Path $clientDir 'cliente.exe'
  & $compiler /nologo /target:winexe "/out:$fakeExe" $cs | Out-Null
  if (-not (Test-Path -LiteralPath $fakeExe)) { throw 'nao compilou o executavel duble' }
  $modeFile = Join-Path $clientDir 'mode.txt'
  $callsFile = Join-Path $clientDir 'calls.txt'
  [IO.File]::WriteAllText($modeFile, 'locked')
  function Get-ExeCalls { if (Test-Path -LiteralPath $callsFile) { return @([IO.File]::ReadAllLines($callsFile) | Where-Object { $_ -ne '--get-id' }).Count }; return 0 }

  # painel falso em memoria (o HTTP real do agente e coberto por test_agent_http/test_agent_401_integration)
  $script:painel = 'https://painel.example'
  $script:calls = New-Object System.Collections.Generic.List[object]
  function Chamar([string]$caminho, [hashtable]$corpo) {
    $script:calls.Add([pscustomobject]@{ path = $caminho; body = $corpo }) | Out-Null
    if ($caminho -eq '/api/nextec/agent/sync') {
      return [pscustomobject]@{ managed = $true; rotate = $true; transaction_v1 = $true; recovery = $false
        approve_mode = 'password'; verification_method = 'use-permanent-password'
        operation = [pscustomobject]@{ operation_id = 'op-1'; pending_version = 2; pending_password = '' } }
    }
    if ($caminho -eq '/api/nextec/agent/password') { return [pscustomobject]@{ ok = $true; operation_id = 'op-1'; pending_version = 2 } }
    if ($caminho -eq '/api/nextec/agent/confirm') { return [pscustomobject]@{ ok = $true; active_version = 2 } }
    throw "rota inesperada: $caminho"
  }
  function Get-Calls([string]$path) { return @($script:calls | Where-Object { $_.path -eq $path }).Count }
  function Get-LastSyncBody { return @($script:calls | Where-Object { $_.path -eq '/api/nextec/agent/sync' })[-1].body }
  function Get-NextecPainelConfigurado { param($Root, $Padrao, $RegistryKey) return $script:painel }
  function ClienteInstalado { return [pscustomobject]@{ ExePath = $fakeExe; PeerId = '536822159' } }

  # variaveis que o corpo do agente le do escopo do script
  $PastaDados = Join-Path $work 'dados'
  New-Item -ItemType Directory -Path $PastaDados | Out-Null
  $Config = Join-Path $PastaDados 'agente-senha.json'
  $Log = Join-Path $PastaDados 'agente-senha.log'
  $Instalar = $false; $Simular = $false; $Exe = $null
  $wait = Join-Path $PastaDados 'agente-senha.bloqueio.json'
  [IO.File]::WriteAllText($Config, (@{ painel = $script:painel; id = '536822159'; token = (Proteger 'token-de-teste') } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
  function Get-LogLines { if (Test-Path -LiteralPath $Log) { return @(Get-Content -LiteralPath $Log -Encoding UTF8) }; return @() }
  $instruction = "O app foi gerado com 'Bloquear configurações'; gere o instalador de novo com a versão atual do gerador e instale por cima"

  # 1) cliente bloqueado: codigo estavel, orientacao no log, espera gravada, nada confirmado
  $ok = Invoke-NextecAgentExecute
  Assert (-not $ok) 'ciclo com cliente bloqueado deveria falhar'
  $logText = (Get-LogLines) -join "`n"
  Assert ($logText -match 'ERRO: client_settings_locked:') "codigo estavel ausente no log: $logText"
  Assert ($logText -notmatch 'password_apply_failed') 'bloqueio classificado como password_apply_failed'
  Assert ($logText.Contains($instruction)) "orientacao ausente no log: $logText"
  Assert (Test-Path -LiteralPath $wait -PathType Leaf) 'espera longa nao foi gravada'
  $waitJson = [IO.File]::ReadAllText($wait) | ConvertFrom-Json
  $hours = ([DateTime]::Parse($waitJson.until, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() - [DateTime]::UtcNow).TotalHours
  Assert ($waitJson.code -eq 'client_settings_locked' -and $hours -gt 5.9 -and $hours -le 6) "espera fora de 6 h: $hours"
  Assert ((Get-Calls '/api/nextec/agent/confirm') -eq 0) 'senha confirmada com cliente bloqueado'
  Write-Host 'PASS Locked_ClassifiedAndLogged'

  # 2) rodada seguinte: sync continua (presenca no painel), cliente nao e chamado, log nao cresce
  $exeBefore = Get-ExeCalls; $syncBefore = Get-Calls '/api/nextec/agent/sync'; $linesBefore = (Get-LogLines).Count
  foreach ($i in 1..3) { Assert (-not (Invoke-NextecAgentExecute)) 'rodada em espera deveria seguir sinalizando falha' }
  Assert ((Get-ExeCalls) -eq $exeBefore) "cliente chamado durante a espera ($exeBefore -> $(Get-ExeCalls))"
  Assert ((Get-Calls '/api/nextec/agent/sync') -eq $syncBefore + 3) 'sync com o painel parou durante a espera'
  Assert ((Get-LogLines).Count -eq $linesBefore) 'log cresceu durante a espera'
  # last_error (0035): as rodadas seguintes informam o codigo estavel ao painel, que mostra 'A troca de senha esta falhando'
  Assert ((Get-LastSyncBody).last_error -ceq 'client_settings_locked') 'sync em espera nao levou last_error = client_settings_locked'
  Assert (-not @($script:calls | Where-Object { $_.path -eq '/api/nextec/agent/sync' })[0].body.ContainsKey('last_error')) 'primeiro sync levou last_error sem falha anterior'
  Write-Host 'PASS Locked_NoRetryDuringWait'

  # 3) espera vencida: tenta de novo e volta a esperar
  $expired = @{ code = 'client_settings_locked'; until = [DateTime]::UtcNow.AddMinutes(-1).ToString('o'); client = $waitJson.client } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($wait, $expired)
  Assert (-not (Invoke-NextecAgentExecute)) 'cliente ainda bloqueado deveria falhar'
  Assert ((Get-ExeCalls) -gt $exeBefore) 'espera vencida nao tentou de novo'
  Assert (Test-Path -LiteralPath $wait -PathType Leaf) 'espera nao foi renovada'
  Write-Host 'PASS Locked_RetriesAfterWait'

  # 4) instalado por cima (executavel mudou) com cliente novo: tenta na hora, aplica e confirma, espera some
  [IO.File]::WriteAllText($modeFile, 'ok')
  (Get-Item -LiteralPath $fakeExe).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes(1)
  Assert (Invoke-NextecAgentExecute) 'cliente reinstalado deveria aplicar a senha'
  Assert ((Get-Calls '/api/nextec/agent/confirm') -eq 1) 'senha nao confirmada apos reinstalacao'
  Assert (-not (Test-Path -LiteralPath $wait)) 'espera nao foi removida apos reinstalacao'
  Assert ([IO.File]::ReadAllText($callsFile) -match '--password') 'senha nao foi aplicada pelo CLI'
  Assert (-not (Test-Path -LiteralPath (Join-Path $PastaDados 'agente-senha.ultimo-erro'))) 'rodada sem erro nao limpou o ultimo erro'
  Assert (Invoke-NextecAgentExecute) 'rodada seguinte deveria passar'
  Assert (-not (Get-LastSyncBody).ContainsKey('last_error')) 'sync depois do sucesso ainda levou last_error (o painel nao limparia o aviso)'
  Write-Host 'PASS Locked_ReinstallClearsWaitAndApplies'

  # 5) unidade: espera de outro executavel nao vale; espera ilegivel e descartada
  [IO.File]::WriteAllText($wait, (@{ code = 'client_settings_locked'; until = [DateTime]::UtcNow.AddHours(5).ToString('o'); client = 'outro' } | ConvertTo-Json -Compress))
  Assert (-not (Test-NextecSettingsLockedWait -Path $wait -Fingerprint 'atual')) 'espera de outro executavel bloqueou'
  [IO.File]::WriteAllText($wait, 'lixo')
  Assert (-not (Test-NextecSettingsLockedWait -Path $wait -Fingerprint 'atual')) 'espera ilegivel bloqueou'
  Assert (-not (Test-Path -LiteralPath $wait)) 'espera ilegivel nao foi descartada'
  Write-Host 'PASS Locked_WaitFileValidation'

  Write-Output 'PASS: client_settings_locked com executavel duble (Settings are disabled!)'
} finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
