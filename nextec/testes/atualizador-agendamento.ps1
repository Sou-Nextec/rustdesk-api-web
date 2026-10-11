$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$updater = Join-Path $repo 'atualizacao\Instalar-Nextec.ps1'
$updatesUi = Join-Path (Split-Path $repo -Parent) '..\src\nextec\views\Updates.vue'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($updater, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw "Instalar-Nextec.ps1 tem erro de sintaxe: $($errors[0].Message)" }

$registerFunction = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'RegistrarAtualizador' }, $true)
if (-not $registerFunction) { throw 'A função que registra a tarefa diária não existe.' }
$registerBody = $registerFunction.Extent.Text
if ($registerBody -notmatch 'Register-ScheduledTask' -or $registerBody -notmatch "-User 'SYSTEM'" -or $registerBody -notmatch 'StartWhenAvailable') {
  throw 'A tarefa deve rodar como SYSTEM e iniciar quando a máquina voltar a ficar disponível.'
}

$manifestCall = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Get-DownloadConnect' -and $n.Extent.Text -match '/versao\.json' }, $true)
$registrationCalls = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'RegistrarAtualizador' }, $true)
if (-not $manifestCall -or -not ($registrationCalls | Where-Object { $_.Extent.StartOffset -lt $manifestCall.Extent.StartOffset })) {
  throw 'O caminho normal precisa registrar a tarefa antes da consulta do manifesto.'
}
if ($registerBody -notmatch '\$SoVerificar') { throw 'O modo SoVerificar deve continuar sem registrar a tarefa.' }

$ui = Get-Content -LiteralPath $updatesUi -Raw
if ($ui -notmatch 'Mesmo sem versão publicada, o script cria ou atualiza a tarefa') {
  throw 'A tela precisa explicar corretamente o estado sem uma publicação.'
}
if ($ui -notmatch 'a execução portátil não cria uma tarefa do sistema') {
  throw 'A tela precisa distinguir execução portátil de instalação completa.'
}
Write-Output 'Passou: sintaxe, tarefa SYSTEM antes do manifesto, SoVerificar e orientação do painel.'
