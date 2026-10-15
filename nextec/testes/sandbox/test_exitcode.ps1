#requires -version 5.1
# Testa Get-SandboxExitCode sem abrir o Windows Sandbox.
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'Get-SandboxExitCode.ps1')
$script:falhas = 0
function Ok([string]$nome, [bool]$cond) {
  if ($cond) { Write-Host "ok   $nome" } else { Write-Host "FALHOU $nome"; $script:falhas++ }
}
function NovoRes($c, $falhas, $ver, $fim = $true, $res = $true, $to = $false) {
  [pscustomobject]@{ Cenario = $c; Falhas = $falhas; Verificacoes = $ver; FimOk = $fim; ResultadoOk = $res; TempoEsgotado = $to }
}
function Cod($pedidos, $resumo) { (Get-SandboxExitCode -Pedidos $pedidos -Resumo $resumo).Codigo }

Ok 'tudo ok => 0' ((Cod @('C1') @(NovoRes 'C1' 0 12)) -eq 0)
Ok 'varios ok => 0' ((Cod @('C1', 'C2') @((NovoRes 'C1' 0 12), (NovoRes 'C2' 0 7))) -eq 0)
Ok 'resultado ausente => 2' ((Cod @('C1') @(NovoRes 'C1' -1 0 $true $false)) -eq 2)
Ok 'fim.json ausente => 2' ((Cod @('C1') @(NovoRes 'C1' 0 12 $false $true)) -eq 2)
Ok 'timeout => 2' ((Cod @('C1') @(NovoRes 'C1' -1 0 $false $false $true)) -eq 2)
Ok 'Falhas = -1 => 2' ((Cod @('C1') @(NovoRes 'C1' -1 5)) -eq 2)
Ok 'zero verificacoes => 3' ((Cod @('C1') @(NovoRes 'C1' 0 0)) -eq 3)
Ok 'falhas > 0 => 4' ((Cod @('C1') @(NovoRes 'C1' 2 12)) -eq 4)
Ok 'varios, um falha => nao zero' ((Cod @('C1', 'C2') @((NovoRes 'C1' 0 12), (NovoRes 'C2' 1 7))) -eq 4)
Ok 'cenario nao executado => 2' ((Cod @('C1', 'C2') @(NovoRes 'C1' 0 12)) -eq 2)
Ok 'nenhum pedido => nao zero' ((Cod @() @()) -ne 0)
Ok 'ausente vence falha (2)' ((Cod @('C1', 'C2') @((NovoRes 'C1' 3 12), (NovoRes 'C2' -1 0 $false $false $true))) -eq 2)
Ok 'uma mensagem por causa' (@((Get-SandboxExitCode -Pedidos @('C1') -Resumo @(NovoRes 'C1' 2 12)).Mensagens).Count -eq 1)
if ($script:falhas) { Write-Host "$script:falhas falha(s)"; exit 1 }
Write-Host 'todos os testes passaram'
exit 0
