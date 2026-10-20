#requires -version 5.1
<#
Codigo do convite de instalacao lido da marca de origem do MSI (Zone.Identifier: HostUrl e ReferrerUrl) e, por compatibilidade,
do nome <app>-<CODIGO>.msi. Sem codigo nenhum: vazio (a maquina entra como Pendente). Usa arquivos reais com fluxo alternativo NTFS
e as funcoes reais do coordenador (extraidas do script por AST, sem executar o resto).
#>
[CmdletBinding()]
param([string]$InstallDir)
$ErrorActionPreference = 'Stop'
if (-not $InstallDir) { $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$script = Join-Path $InstallDir 'Coordenar-Agente-Nextec.ps1'
function Assert($value, [string]$message) { if (-not $value) { throw "ASSERT: $message" } }

$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors)
Assert (-not $errors -or $errors.Count -eq 0) 'script sem erro de sintaxe'
$wanted = 'Get-NextecInviteCodeFromName', 'Get-NextecInviteCodeFromUrl', 'Get-NextecInviteCodeFromZone', 'Get-NextecInviteCode'
foreach ($f in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $wanted -contains $n.Name }, $true)) {
  . ([scriptblock]::Create($f.Extent.Text))
}
foreach ($n in $wanted) { Assert (Get-Command $n -ErrorAction SilentlyContinue) "funcao $n carregada" }

$work = Join-Path ([IO.Path]::GetTempPath()) ('nextec-origem-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$code = 'K7M2QX9P4TA8B3C5D6E2'
$other = 'ABCDEFGHJKMNPQRSTUVW'
function New-Msi([string]$name, [string[]]$zone) {
  $path = Join-Path $work $name
  [IO.File]::WriteAllBytes($path, [byte[]](0xD0, 0xCF, 0x11, 0xE0))
  if ($zone) { Set-Content -LiteralPath $path -Stream 'Zone.Identifier' -Value $zone -Encoding ASCII }
  $path
}
try {
  # nome fixo + marca de origem do navegador: o codigo vem do HostUrl
  $p = New-Msi 'nextec-acesso-2.4.0.msi' @('[ZoneTransfer]', 'ZoneId=3', "ReferrerUrl=https://painel-remoto.nex.tec.br/i/$code", "HostUrl=https://painel-remoto.nex.tec.br/i/$code/baixar")
  Assert ((Get-NextecInviteCode -Origem $p) -eq $code) 'HostUrl com /i/<codigo>/baixar'
  # so o ReferrerUrl (navegadores que nao gravam o HostUrl do arquivo)
  $p = New-Msi 'nextec-acesso-2.4.1.msi' @('[ZoneTransfer]', 'ZoneId=3', "ReferrerUrl=https://painel-remoto.nex.tec.br/i/$code")
  Assert ((Get-NextecInviteCode -Origem $p) -eq $code) 'so ReferrerUrl'
  # minusculas na URL viram maiusculas; porta e query ok
  $p = New-Msi 'nextec-acesso-2.4.2.msi' @('[ZoneTransfer]', 'ZoneId=3', "HostUrl=http://10.0.0.5:21114/i/$($code.ToLower())/baixar?x=1")
  Assert ((Get-NextecInviteCode -Origem $p) -eq $code) 'minusculas, porta e query'
  # HostUrl de outro endereco (nao e convite) e ReferrerUrl valido: usa o que for convite
  $p = New-Msi 'nextec-acesso-2.4.3.msi' @('[ZoneTransfer]', 'ZoneId=3', 'HostUrl=https://exemplo.com/download/app.msi', "ReferrerUrl=https://painel-remoto.nex.tec.br/i/$code")
  Assert ((Get-NextecInviteCode -Origem $p) -eq $code) 'HostUrl comum, ReferrerUrl de convite'
  # codigo invalido (alfabeto errado, tamanho errado, caminho que nao e /i/) nao vale
  $p = New-Msi 'nextec-acesso-2.4.4.msi' @('[ZoneTransfer]', 'ZoneId=3', 'HostUrl=https://painel/i/K7M2QX9P4TA8B3C5D6E0/baixar', 'ReferrerUrl=https://painel/i/K7M2QX9P4TA8B3C5D6E/baixar')
  Assert ((Get-NextecInviteCode -Origem $p) -eq '') 'codigo invalido'
  $p = New-Msi 'nextec-acesso-2.4.5.msi' @('[ZoneTransfer]', 'ZoneId=3', "HostUrl=https://painel/s/$code/baixar", "ReferrerUrl=https://painel/x/i/$code")
  Assert ((Get-NextecInviteCode -Origem $p) -eq '') 'caminho que nao e /i/<codigo>'
  # sem marca de origem e sem codigo no nome: vazio (maquina entra como Pendente)
  $p = New-Msi 'nextec-acesso-2.4.6.msi' $null
  Assert ((Get-NextecInviteCode -Origem $p) -eq '') 'sem marca e sem codigo no nome'
  Assert ((Get-NextecInviteCode -Origem '') -eq '') 'origem vazia'
  Assert ((Get-NextecInviteCode -Origem (Join-Path $work 'nao-existe.msi')) -eq '') 'arquivo inexistente nao lanca'
  # compatibilidade: MSI baixado antes desta versao tem o codigo no nome
  $p = New-Msi "nextec-acesso-2.3.0-$code.msi" $null
  Assert ((Get-NextecInviteCode -Origem $p) -eq $code) 'codigo no nome (compatibilidade)'
  $p = New-Msi "nextec-acesso-2.3.0-$code (1).msi" $null
  Assert ((Get-NextecInviteCode -Origem $p) -eq $code) 'codigo no nome com (1)'
  # nome com codigo e marca com outro codigo: a marca do navegador (origem real do download) vence
  $p = New-Msi "nextec-acesso-2.3.0-$other.msi" @('[ZoneTransfer]', 'ZoneId=3', "HostUrl=https://painel/i/$code/baixar")
  Assert ((Get-NextecInviteCode -Origem $p) -eq $code) 'marca vence o nome'
  # funcoes de URL isoladas
  Assert ((Get-NextecInviteCodeFromUrl -Url "https://a.b/i/$code") -eq $code) 'url sem sufixo'
  Assert ((Get-NextecInviteCodeFromUrl -Url ("https://a.b/i/$code" + ('x' * 3000))) -eq '') 'url longa demais'
  Assert ((Get-NextecInviteCodeFromUrl -Url "ftp://a.b/i/$code") -eq '') 'so http e https'
  Write-Host 'test_convite_origem: ok'
} finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
