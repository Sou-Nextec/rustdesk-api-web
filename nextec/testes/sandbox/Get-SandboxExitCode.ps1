#requires -version 5.1
<#
Decisao pura do codigo de saida do teste no Windows Sandbox (sem I/O, dot-sourceable).
Entrada: -Pedidos (nomes dos cenarios pedidos) e -Resumo (objetos com Cenario, Falhas, Verificacoes,
FimOk, ResultadoOk, TempoEsgotado). Saida: objeto com Codigo (0, 2, 3 ou 4) e Mensagens.
  0 = todos os cenarios pedidos com resultado valido, Verificacoes > 0 e Falhas = 0
  2 = fim.json/resultado.json ausente, tempo esgotado, Falhas = -1 ou cenario nao executado
  3 = zero verificacoes
  4 = verificacoes falharam (Falhas > 0)
Com mais de uma causa vence a de menor numero (2, depois 3, depois 4); todas entram em Mensagens.
#>
function Get-SandboxExitCode {
  param([string[]]$Pedidos = @(), [object[]]$Resumo = @())
  $c2 = New-Object System.Collections.Generic.List[string]
  $c3 = New-Object System.Collections.Generic.List[string]
  $c4 = New-Object System.Collections.Generic.List[string]
  $porNome = @{}
  foreach ($r in $Resumo) { if ($null -ne $r -and $r.Cenario) { $porNome[[string]$r.Cenario] = $r } }
  if ($Pedidos.Count -eq 0) { $c2.Add('Nenhum cenario foi pedido; nada foi validado.') }
  foreach ($nome in $Pedidos) {
    $r = $porNome[$nome]
    if ($null -eq $r) { $c2.Add("[$nome] cenario nao executado: nao ha resumo para ele."); continue }
    if ($r.TempoEsgotado) { $c2.Add("[$nome] tempo esgotado: o sandbox nao terminou no prazo (fim.json ausente).") }
    elseif (-not $r.FimOk) { $c2.Add("[$nome] fim.json ausente: o sandbox nao concluiu.") }
    if (-not $r.ResultadoOk) { $c2.Add("[$nome] resultado.json ausente ou ilegivel: execucao invalida."); continue }
    if ([int]$r.Falhas -lt 0) { $c2.Add("[$nome] Falhas = -1: execucao invalida."); continue }
    if ([int]$r.Verificacoes -le 0) { $c3.Add("[$nome] zero verificacoes executadas: o teste nao provou nada."); continue }
    if ([int]$r.Falhas -gt 0) { $c4.Add("[$nome] " + [int]$r.Falhas + ' de ' + [int]$r.Verificacoes + ' verificacoes falharam.') }
  }
  $codigo = 0
  if ($c4.Count) { $codigo = 4 }
  if ($c3.Count) { $codigo = 3 }
  if ($c2.Count) { $codigo = 2 }
  $msgs = @($c2.ToArray()) + @($c3.ToArray()) + @($c4.ToArray())
  [pscustomobject]@{ Codigo = $codigo; Mensagens = $msgs }
}
