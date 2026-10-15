#requires -version 5.1
<#
Monta verificacoes.md (tabela de todas as verificacoes) a partir dos resultado.json de saida\<cenario>.
Uso: .\Resumir-Resultado.ps1 -Saida <pasta> [-Cenarios C1,C2,C3,C4] [-Commit <sha>]
#>
param([Parameter(Mandatory)][string]$Saida, [string[]]$Cenarios = @('C1', 'C2', 'C3', 'C4'), [string]$Commit = '')
$Cenarios = @($Cenarios | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$md = @('# Verificacoes do teste no Windows Sandbox', '', ('Arvore do painel: ' + $Commit), '')
foreach ($c in $Cenarios) {
  $res = Join-Path $Saida ('saida\' + $c + '\resultado.json')
  if (-not (Test-Path -LiteralPath $res)) { $md += ('## ' + $c); $md += ''; $md += 'Sem resultado (o sandbox nao terminou).'; $md += ''; continue }
  $j = [IO.File]::ReadAllText($res) | ConvertFrom-Json
  $md += ('## ' + $c + ': ' + ($j.total - $j.falhas) + ' de ' + $j.total + ' verificacoes passaram')
  $md += ''
  $md += '| Resultado | Verificacao | Detalhe |'
  $md += '| --- | --- | --- |'
  foreach ($r in $j.resultados) {
    $tag = 'FALHOU'; if ($r.ok) { $tag = 'passou' }
    $md += ('| ' + $tag + ' | ' + ([string]$r.check -replace '\|', '/') + ' | ' + ([string]$r.detail -replace '\|', '/' -replace '\s+', ' ') + ' |')
  }
  foreach ($n in $j.notas) { $md += ''; $md += ('Nota: ' + $n) }
  $md += ''
}
[IO.File]::WriteAllText((Join-Path $Saida 'verificacoes.md'), (($md -join "`r`n") + "`r`n"), (New-Object Text.UTF8Encoding($true)))
