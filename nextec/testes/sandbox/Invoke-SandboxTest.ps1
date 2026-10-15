#requires -version 5.1
<#
.SYNOPSIS
  Lanca o teste ponta a ponta do agente Nextec no Windows Sandbox (host). Um sandbox novo por cenario.
.DESCRIPTION
  Prepara a pasta de entrada (somente leitura no sandbox) com o MSI do app, os scripts do agente desta arvore, o
  Ativar-Nextec-<ID>.cmd modelo (gerado por node com o mesmo pacote do painel) e os scripts de teste; para cada cenario
  gera o .wsb (rede desligada), abre o sandbox, espera o fim.json e junta o resultado em RESULTADO.md.
  Nada e instalado no host. Exige: Windows 10/11 Pro com o recurso Windows Sandbox, node e git.
.EXAMPLE
  .\Invoke-SandboxTest.ps1 -MsiApp 'D:\clientes\2.0.7\Nextec-Connect.msi' -Saida 'D:\auditoria\sandbox-2026-10-14'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$MsiApp,
  [string]$Saida,
  [string[]]$Cenarios = @('C1', 'C2', 'C3', 'C4'),
  [string]$AgenteAntigoCommit = 'd9e01ce',
  [string]$AgentePreCorrecaoCommit = 'e6d178b^',
  [int]$TimeoutMinutos = 25
)
$ErrorActionPreference = 'Stop'
$Cenarios = @($Cenarios | ForEach-Object { $_ -split ',' } | Where-Object { $_ })   # aceita C1,C2 vindo de -File
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (git -C $here rev-parse --show-toplevel).Trim()
if (-not $Saida) { $Saida = Join-Path (Split-Path -Parent $repo) ('auditoria\sandbox-' + (Get-Date -Format 'yyyy-MM-dd')) }
$sandboxExe = Join-Path $env:SystemRoot 'System32\WindowsSandbox.exe'
if (-not (Test-Path -LiteralPath $sandboxExe)) { throw 'WindowsSandbox.exe nao existe. Em PowerShell administrador: Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All (e reinicie).' }
if (-not (Test-Path -LiteralPath $MsiApp -PathType Leaf)) { throw "MSI nao encontrado: $MsiApp" }
$running = @(Get-Process -Name 'WindowsSandbox*' -ErrorAction SilentlyContinue)
if ($running.Count) { throw 'Ja existe um Windows Sandbox aberto (so um por vez). Feche-o e rode de novo.' }

$entrada = Join-Path $Saida 'entrada'
if (Test-Path -LiteralPath $entrada) { Remove-Item -LiteralPath $entrada -Recurse -Force }
New-Item -ItemType Directory -Force -Path $entrada, (Join-Path $Saida 'wsb'), (Join-Path $Saida 'saida') | Out-Null
& node (Join-Path $here 'gerar-entrada.mjs') $entrada
if ($LASTEXITCODE -ne 0) { throw 'gerar-entrada.mjs falhou' }
Copy-Item -LiteralPath $MsiApp -Destination (Join-Path $entrada 'app.msi')
foreach ($f in 'Run-InSandbox.ps1', 'FakePanel.ps1') { Copy-Item -LiteralPath (Join-Path $here $f) -Destination (Join-Path $entrada $f) }
foreach ($par in @(@('antigo-11-10', $AgenteAntigoCommit), @('antigo-pre-fix', $AgentePreCorrecaoCommit))) {
  $dir = Join-Path $entrada $par[0]
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $tmp = Join-Path $dir 'Agente-Senha-Nextec.ps1'
  # bytes exatos do git (sem conversao de texto)
  $psi = New-Object Diagnostics.ProcessStartInfo('git', ('-C "' + $repo + '" show ' + $par[1] + ':nextec/atualizacao/Agente-Senha-Nextec.ps1'))
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true
  $p = [Diagnostics.Process]::Start($psi)
  $ms = New-Object IO.MemoryStream
  $p.StandardOutput.BaseStream.CopyTo($ms)
  $p.WaitForExit()
  if ($p.ExitCode -ne 0 -or $ms.Length -lt 1000) { throw ('git show falhou para ' + $par[1]) }
  [IO.File]::WriteAllBytes($tmp, $ms.ToArray())
}
function Get-Sha256([string]$Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path))) -replace '-', '') } finally { $sha.Dispose() }
}
$sums = Get-ChildItem -LiteralPath $entrada -Recurse -File | ForEach-Object { '{0}  {1}' -f (Get-Sha256 $_.FullName), $_.FullName.Substring($entrada.Length + 1) }
[IO.File]::WriteAllText((Join-Path $Saida 'ENTRADA-SHA256.txt'), (($sums -join "`r`n") + "`r`n"))
$commit = (git -C $repo rev-parse HEAD).Trim()
Write-Host ("Entrada pronta em $entrada (arvore do painel $commit)")

$modelo = [IO.File]::ReadAllText((Join-Path $here 'modelo.wsb'))
$resumo = @()
foreach ($c in $Cenarios) {
  $out = Join-Path $Saida ('saida\' + $c)
  if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  $wsb = Join-Path $Saida ('wsb\' + $c + '.wsb')
  [IO.File]::WriteAllText($wsb, $modelo.Replace('{{ENTRADA}}', $entrada).Replace('{{SAIDA}}', $out).Replace('{{CENARIO}}', $c))
  Write-Host ("[$c] abrindo o sandbox ...")
  $t0 = Get-Date
  Start-Process -FilePath $sandboxExe -ArgumentList ('"' + $wsb + '"') | Out-Null
  $fim = Join-Path $out 'fim.json'
  $deadline = $t0.AddMinutes($TimeoutMinutos)
  while (-not (Test-Path -LiteralPath $fim) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 5 }
  $ok = Test-Path -LiteralPath $fim
  if (-not $ok) { Write-Warning "[$c] tempo esgotado sem fim.json" }
  # o proprio teste desliga o sandbox; se nao fechar em 90 s, encerra so os processos abertos depois do inicio
  $end = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $end -and @(Get-Process -Name 'WindowsSandbox*' -ErrorAction SilentlyContinue).Count) { Start-Sleep -Seconds 3 }
  Get-Process -Name 'WindowsSandbox*' -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -ge $t0 } | Stop-Process -Force -ErrorAction SilentlyContinue
  $res = Join-Path $out 'resultado.json'
  $falhas = -1; $total = 0
  if (Test-Path -LiteralPath $res) { $j = [IO.File]::ReadAllText($res) | ConvertFrom-Json; $falhas = $j.falhas; $total = $j.total }
  $resumo += [pscustomobject]@{ Cenario = $c; Falhas = $falhas; Verificacoes = $total; Minutos = [math]::Round(((Get-Date) - $t0).TotalMinutes, 1) }
}
$resumo | Format-Table -AutoSize | Out-String | Write-Host
$resumo | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Saida 'resumo.json') -Encoding UTF8

& (Join-Path $here 'Resumir-Resultado.ps1') -Saida $Saida -Cenarios $Cenarios -Commit $commit
