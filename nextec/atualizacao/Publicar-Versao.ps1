<#
.SYNOPSIS
  Prepara uma versão nova para publicar: copia o MSI com o nome certo e atualiza o versao.json.

.EXAMPLE
  .\Publicar-Versao.ps1 -Msi C:\Downloads\nextec.msi -Versao 1.0.1
  Depois, envie a pasta .\publicar\ (o MSI novo e o versao.json) para o bucket do R2.
#>
param(
  [Parameter(Mandatory)][string]$Msi,
  [Parameter(Mandatory)][string]$Versao,
  [string]$Saida = (Join-Path $PSScriptRoot 'publicar')
)
$ErrorActionPreference = 'Stop'
[void][version]$Versao   # falha se não for número de versão (ex.: 1.0.1)
New-Item -ItemType Directory -Path $Saida -Force | Out-Null
$nome = "nextec-acesso-$Versao.msi"
Copy-Item -Path $Msi -Destination (Join-Path $Saida $nome) -Force
$hash = (Get-FileHash -Path (Join-Path $Saida $nome) -Algorithm SHA256).Hash
$arq = Join-Path $Saida 'versao.json'
$obj = if (Test-Path $arq) { ([IO.File]::ReadAllText($arq)).TrimStart([char]0xFEFF) | ConvertFrom-Json } else { [pscustomobject]@{ windows = $null; linux = $null } }
$obj.windows = [pscustomobject]@{ versao = $Versao; arquivo = $nome; sha256 = $hash }
# UTF-8 sem BOM, para qualquer cliente conseguir ler
[IO.File]::WriteAllText($arq, ($obj | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
Write-Host "Pronto. Envie para o R2: $nome e versao.json"
Write-Host "SHA-256: $hash"
