#requires -version 5.1
$ErrorActionPreference='Stop'
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1'),[ref]$null,[ref]$null)
$fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Chamar'},$true)
. ([scriptblock]::Create($fn.Extent.Text))
$script:PainelUrl='https://painel-remoto.nex.tec.br'
$script:requests=0
function Invoke-WebRequest {
 param($Uri,$Method,$ContentType,$Body,[switch]$UseBasicParsing,$TimeoutSec,[int]$MaximumRedirection=-1)
 $script:requests++
 if($MaximumRedirection -ne 0){throw 'Secret-bearing agent request allows redirect'}
 if($Uri -ne 'https://painel-remoto.nex.tec.br/api/nextec/agent/sync'){throw 'Unexpected origin'}
 throw 'HTTP 307 rejected before following Location'
}
$rejected=$false
try {Chamar '/api/nextec/agent/sync' @{token='test-only'} | Out-Null} catch {$rejected=$_.Exception.Message -eq 'HTTP 307 rejected before following Location'}
if(!$rejected -or $script:requests -ne 1){throw 'Redirect contract failed'}
'Agent HTTP redirect rejection: PASS (request double)'
