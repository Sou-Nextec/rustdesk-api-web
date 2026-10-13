#requires -version 5.1
$ErrorActionPreference = 'Stop'
function Assert($value, [string]$message) { if (-not $value) { throw $message } }
$padrao = 'https://painel-remoto.nex.tec.br'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('nextec-painel-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

function Import-Funcoes([string]$arquivo) {
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $arquivo), [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw "sintaxe invalida em $arquivo" }
  foreach ($n in 'ConvertTo-NextecPainelUrl', 'Get-NextecPainelConfigurado') {
    $f = $ast.FindAll({ param($x) $x -is [Management.Automation.Language.FunctionDefinitionAst] -and $x.Name -ceq $n }, $true) | Select-Object -First 1
    Assert $f "$n ausente em $arquivo"
    . ([scriptblock]::Create($f.Extent.Text))
  }
}

try {
  foreach ($arquivo in 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1', 'Instalar-Nextec.ps1') {
    . Import-Funcoes $arquivo
    $root = Join-Path $tmp ([IO.Path]::GetFileNameWithoutExtension($arquivo))
    New-Item -ItemType Directory -Path $root -Force | Out-Null

    # arquivo ausente: cai no padrao e marca a origem para o aviso
    $r = Get-NextecPainelConfigurado -Root $root -Padrao $padrao
    Assert ($r -ceq $padrao -and $script:NextecPainelOrigem -ceq 'padrao') "$arquivo : ausente nao caiu no padrao"

    # host da config vence o fixo
    @{ v = 1; painel = 'https://novo.exemplo.com.br'; chave = 'C' * 20 } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $root 'inscricao.json') -Encoding UTF8
    $r = Get-NextecPainelConfigurado -Root $root -Padrao $padrao
    Assert ($r -ceq 'https://novo.exemplo.com.br' -and $script:NextecPainelOrigem -like '*inscricao.json') "$arquivo : host da config nao venceu"

    # recusas: http, credencial, IP literal, porta, caminho, nome sem dominio
    foreach ($ruim in 'http://novo.exemplo.com.br', 'https://u:p@novo.exemplo.com.br', 'https://novo.exemplo.com.br@evil.com', 'https://10.0.0.5', 'https://novo.exemplo.com.br:8443', 'https://novo.exemplo.com.br/x', 'https://localhost', 'https://novo.exemplo.com.br?q=1') {
      @{ v = 1; painel = $ruim; chave = 'C' * 20 } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $root 'inscricao.json') -Encoding UTF8
      $r = Get-NextecPainelConfigurado -Root $root -Padrao $padrao
      Assert ($r -ceq $padrao -and $script:NextecPainelOrigem -ceq 'padrao') "$arquivo : aceitou painel invalido $ruim"
    }
    # JSON quebrado cai no padrao
    Set-Content -LiteralPath (Join-Path $root 'inscricao.json') -Value '{nao json' -Encoding UTF8
    Assert ((Get-NextecPainelConfigurado -Root $root -Padrao $padrao) -ceq $padrao) "$arquivo : json invalido"
    # marcador tambem serve quando nao ha inscricao.json
    Remove-Item -LiteralPath (Join-Path $root 'inscricao.json') -Force
    @{ AppName = 'XPTO'; painel = 'https://marcador.exemplo.com.br' } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $root 'nextec-marker.json') -Encoding UTF8
    Assert ((Get-NextecPainelConfigurado -Root $root -Padrao $padrao) -ceq 'https://marcador.exemplo.com.br') "$arquivo : marcador ignorado"
  }
  # nenhum script compara contra o host fixo literal fora do valor padrao
  foreach ($arquivo in 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1') {
    $texto = Get-Content -LiteralPath (Join-Path $PSScriptRoot $arquivo) -Raw -Encoding UTF8
    Assert ($texto -notmatch "-cne 'https://painel-remoto|-cne 'painel-remoto") "$arquivo : ainda compara com host fixo"
  }
  Write-Host 'painel configuravel: OK'
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
