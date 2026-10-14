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
  # Achado 2 (revisao #45): o painel do build tambem vive no registro (valor Painel), lido antes do padrao e depois dos arquivos.
  foreach ($arquivo in 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1', 'Instalar-Nextec.ps1') {
    . Import-Funcoes $arquivo
    $root = Join-Path $tmp ('reg-' + [IO.Path]::GetFileNameWithoutExtension($arquivo))
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $regKey = 'HKCU:\Software\NextecTeste\' + [Guid]::NewGuid().ToString('N')
    New-Item -Path $regKey -Force | Out-Null
    try {
      Assert ((Get-NextecPainelConfigurado -Root $root -Padrao $padrao -RegistryKey $regKey) -ceq $padrao) "$arquivo : registro vazio nao caiu no padrao"
      Set-ItemProperty -LiteralPath $regKey -Name Painel -Value 'https://registro.exemplo.com.br'
      $r = Get-NextecPainelConfigurado -Root $root -Padrao $padrao -RegistryKey $regKey
      Assert ($r -ceq 'https://registro.exemplo.com.br' -and $script:NextecPainelOrigem -ceq $regKey) "$arquivo : painel do registro ignorado"
      @{ v = 1; painel = 'https://arquivo.exemplo.com.br'; chave = 'C' * 20 } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $root 'inscricao.json') -Encoding UTF8
      Assert ((Get-NextecPainelConfigurado -Root $root -Padrao $padrao -RegistryKey $regKey) -ceq 'https://arquivo.exemplo.com.br') "$arquivo : inscricao.json deve vencer o registro"
      Remove-Item -LiteralPath (Join-Path $root 'inscricao.json') -Force
      foreach ($ruim in 'http://registro.exemplo.com.br', 'https://u:p@registro.exemplo.com.br', 'https://10.0.0.5', 'https://registro.exemplo.com.br:8443', 'https://registro.exemplo.com.br/x') {
        Set-ItemProperty -LiteralPath $regKey -Name Painel -Value $ruim
        Assert ((Get-NextecPainelConfigurado -Root $root -Padrao $padrao -RegistryKey $regKey) -ceq $padrao) "$arquivo : painel invalido no registro aceito: $ruim"
      }
    } finally { Remove-Item -LiteralPath $regKey -Recurse -Force -ErrorAction SilentlyContinue }
  }
  # Achado 3: o -UrlBase explicito do build nao e sobrescrito pelo painel da inscricao.
  $tokens = $null; $errors = $null
  $astInst = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Instalar-Nextec.ps1'), [ref]$tokens, [ref]$errors)
  $fn = $astInst.FindAll({ param($x) $x -is [Management.Automation.Language.FunctionDefinitionAst] -and $x.Name -ceq 'Resolve-NextecUpdateBase' }, $true) | Select-Object -First 1
  Assert $fn 'Resolve-NextecUpdateBase ausente em Instalar-Nextec.ps1'
  . ([scriptblock]::Create($fn.Extent.Text))
  $r = Resolve-NextecUpdateBase -UrlBase 'https://atualiza.exemplo.com.br/api/nextec/update' -PainelConfigurado 'https://novo.exemplo.com.br'
  Assert ($r.UrlBase -ceq 'https://atualiza.exemplo.com.br/api/nextec/update' -and $r.Origem -ceq 'parametro') '-UrlBase explicito foi sobrescrito pelo painel da inscricao'
  $r = Resolve-NextecUpdateBase -UrlBase '' -PainelConfigurado 'https://novo.exemplo.com.br'
  Assert ($r.UrlBase -ceq 'https://novo.exemplo.com.br/api/nextec/update' -and $r.Origem -ceq 'painel') 'sem -UrlBase o painel da inscricao deve ser o padrao'
  $r = Resolve-NextecUpdateBase -UrlBase '' -PainelConfigurado ''
  Assert ($r.UrlBase -ceq 'https://painel-remoto.nex.tec.br/api/nextec/update' -and $r.Origem -ceq 'padrao') 'sem nada deve cair no painel antigo'
  # nenhum script compara contra o host fixo literal fora do valor padrao
  foreach ($arquivo in 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1') {
    $texto = Get-Content -LiteralPath (Join-Path $PSScriptRoot $arquivo) -Raw -Encoding UTF8
    Assert ($texto -notmatch "-cne 'https://painel-remoto|-cne 'painel-remoto") "$arquivo : ainda compara com host fixo"
  }
  # ponta a ponta simulada: resposta REAL da API (gerada pelo teste Go com outro dominio) aceita pelo provisionador
  $fixture = Join-Path (Join-Path (Join-Path $PSScriptRoot '..') 'testes\fixtures') 'bootstrap-outro-dominio.json'
  $resp = [IO.File]::ReadAllText($fixture, [Text.Encoding]::UTF8) | ConvertFrom-Json
  Assert ($resp.code -eq 0 -and $resp.data.painel -ceq 'https://painel.outro.exemplo') 'fixture da API sem o dominio configurado'
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Provisionar-Agente-Nextec.ps1'), [ref]$tokens, [ref]$errors)
  foreach ($n in 'ConvertTo-NextecPainelUrl', 'Get-NextecPainelConfigurado', 'ConvertFrom-NextecStrictBootstrapJson') {
    $f = $ast.FindAll({ param($x) $x -is [Management.Automation.Language.FunctionDefinitionAst] -and $x.Name -ceq $n }, $true) | Select-Object -First 1
    Assert $f "$n ausente"
    . ([scriptblock]::Create($f.Extent.Text))
  }
  $e2e = Join-Path $tmp 'e2e'; New-Item -ItemType Directory -Path $e2e -Force | Out-Null
  @{ v = 1; painel = 'https://painel.outro.exemplo'; chave = 'C' * 20 } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $e2e 'inscricao.json') -Encoding UTF8
  $script:NextecPainelFixo = Get-NextecPainelConfigurado -Root $e2e -Padrao $padrao
  $autorizacao = [ordered]@{ painel = $resp.data.painel; id = $resp.data.id; uuid = $resp.data.uuid; bootstrap = $resp.data.bootstrap } | ConvertTo-Json -Compress
  $ok = ConvertFrom-NextecStrictBootstrapJson $autorizacao
  Assert ($ok.painel -ceq 'https://painel.outro.exemplo' -and $ok.id -ceq '536822159') 'autorizacao do outro dominio recusada'
  # agente instalado com outro painel recusa a autorizacao deste (trocar de dominio sem reinstalar nao confunde)
  $script:NextecPainelFixo = $padrao
  $recusou = $false
  try { ConvertFrom-NextecStrictBootstrapJson $autorizacao | Out-Null } catch { $recusou = ($_.Exception.Message -ceq 'invalid_panel') }
  Assert $recusou 'autorizacao de outro painel foi aceita'
  Write-Host 'painel configuravel: OK'
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
