#requires -version 5.1
# Diagnostico: somente leitura, nunca imprime segredo e aponta os problemas de campo conhecidos.
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'Diagnostico-Agente-Nextec.ps1'
$errors = $null
[void][Management.Automation.Language.Parser]::ParseFile($script, [ref]$null, [ref]$errors)
if ($errors.Count) { throw "Diagnostico nao compila: $($errors[0].Message)" }
function Assert([bool]$c, [string]$m) { if (-not $c) { throw "ASSERT: $m" } }

$root = Join-Path ([IO.Path]::GetTempPath()) ('nextec-diag-' + [Guid]::NewGuid().ToString('N'))
$dados = Join-Path $root 'Acesso'
New-Item -ItemType Directory -Path $dados -Force | Out-Null
try {
  $segredo = 'SEGREDO-TOKEN-1234567890abcdef'
  Set-Content -LiteralPath (Join-Path $dados 'agente-senha.json') -Value ('{"painel":"https://p.example","id":"536822159","token":"' + $segredo + '"}') -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $dados 'agente-senha.log') -Encoding UTF8 -Value @(
    '2026-10-13 21:09:38  ERRO: The remote server returned an error: (401) Unauthorized.',
    ('2026-10-13 21:10:00  debug token=' + $segredo + ' senha: S3nh4Super$ecreta'))
  Set-Content -LiteralPath (Join-Path $dados 'provisionamento-agente.log') -Encoding UTF8 -Value @('2026-10-13 21:10:00 identity_conflict', '2026-10-13 21:15:00 unsafe_path')
  Set-Content -LiteralPath (Join-Path $dados 'inscricao.json') -Encoding UTF8 -Value '{"v":1,"painel":"https://painel.xpto.example","chave":"nx2.7.3.abababababababababababababababababababababababababababababababab"}'
  Set-Content -LiteralPath (Join-Path $dados 'bootstrap.json') -Encoding UTF8 -Value '{}'

  $saida = Join-Path $root 'relatorio.txt'
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Saida $saida -PastaDados $dados 2>&1 | Out-String
  Assert (Test-Path -LiteralPath $saida) 'relatorio nao foi gravado'
  $texto = [IO.File]::ReadAllText($saida)
  Assert ($texto -eq ($texto)) 'leitura'
  foreach ($conteudo in @($out, $texto)) {
    Assert (-not $conteudo.Contains($segredo)) 'o token apareceu no relatorio'
    Assert (-not $conteudo.Contains('S3nh4Super')) 'a senha apareceu no relatorio'
    Assert (-not $conteudo.Contains('abababababababababababababababab')) 'a chave de inscricao apareceu no relatorio'
  }
  Assert ($texto -match '== Resumo') 'sem resumo'
  Assert ($texto -match 'por cliente \(entra aprovada no cliente\)') 'nao reconheceu a credencial por cliente'
  Assert ($texto -match '\(401\)|recusa a credencial') 'nao apontou o 401'
  Assert ($texto -match 'identity_conflict') 'nao apontou identity_conflict'
  Assert ($texto -match 'unsafe_path') 'nao apontou unsafe_path'
  Assert ($texto -match 'bootstrap\.json parado') 'nao apontou o bootstrap.json parado'
  Assert ($texto -match 'Falta Coordenar-Agente-Nextec\.ps1') 'nao apontou o coordenador ausente'
  # somente leitura: os arquivos continuam como estavam
  Assert (Test-Path -LiteralPath (Join-Path $dados 'bootstrap.json')) 'o diagnostico mexeu nos arquivos'
  Assert ((Get-ChildItem -LiteralPath $dados -File).Count -eq 5) 'o diagnostico criou ou apagou arquivos na pasta do agente'
  Write-Host 'Diagnostico: PASS'
} finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
