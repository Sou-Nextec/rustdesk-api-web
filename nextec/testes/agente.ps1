$ErrorActionPreference = 'Stop'
$base = 'http://localhost:21114'
$agente = Join-Path (Split-Path $PSScriptRoot -Parent) 'atualizacao\Agente-Senha-Nextec.ps1'
$pasta = Join-Path $env:TEMP 'nx-agente-teste'
Remove-Item $pasta -Recurse -Force -ErrorAction SilentlyContinue
$res = New-Object System.Collections.Generic.List[object]
function Ok($n, $c, $d = '') { $res.Add([pscustomobject]@{ Teste = $n; Passou = [bool]$c; Detalhe = $d }) }
function Api($m, $p, $b, $t) {
  $h = @{}; if ($t) { $h['api-token'] = $t }
  $x = @{ Uri = "$base$p"; Method = $m; Headers = $h; ContentType = 'application/json'; UseBasicParsing = $true }
  if ($b) { $x['Body'] = ($b | ConvertTo-Json -Compress) }
  (Invoke-WebRequest @x).Content | ConvertFrom-Json
}

# sintaxe no Windows PowerShell 5.1
$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($agente, [ref]$null, [ref]$e)
Ok 'sintaxe do agente (parser)' ($e.Count -eq 0)

$tok = (Api 'POST' '/api/admin/login' @{ username = 'admin'; password = $env:NX_TESTE_SENHA; platform = 'web' } $null).data.token
$key = (Api 'POST' '/api/admin/nextec/secrets/agent-key' @{} $tok).data.key
$id = 'SIM' + (Get-Random -Minimum 1000000 -Maximum 9999999)

# Regressão: instalador elevado e tarefa SYSTEM precisam operar no perfil do serviço,
# e uma falha do RustDesk ao aplicar a senha não pode ser confirmada no painel.
$mock = Join-Path $pasta 'rustdesk-mock.cmd'
$mockScript = Join-Path $pasta 'rustdesk-mock.ps1'
New-Item -ItemType Directory -Path $pasta -Force | Out-Null
@'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$RustDeskArgs)
Set-Content -Path $env:NX_TEST_RUSTDESK_MARKER -Value $env:APPDATA
if ($env:APPDATA -ne $env:NX_TEST_RUSTDESK_EXPECTED_APPDATA) { Write-Output 'APPDATA foi alterado'; exit 91 }
if ($RustDeskArgs[0] -eq '--get-id') { Write-Output $env:NX_TEST_RUSTDESK_ID; exit 0 }
if ($RustDeskArgs[0] -eq '--password' -and $env:NX_TEST_RUSTDESK_FAIL_PASSWORD -eq '1') { Write-Output 'IPC error'; exit 7 }
if ($RustDeskArgs[0] -eq '--password') { Write-Output 'Done!'; exit 0 }
exit 0
'@ | Set-Content -Path $mockScript -Encoding UTF8
'@echo off' | Set-Content -Path $mock -Encoding ASCII
'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rustdesk-mock.ps1" %*' | Add-Content -Path $mock -Encoding ASCII
'exit /b %errorlevel%' | Add-Content -Path $mock -Encoding ASCII
$idServico = [string](Get-Random -Minimum 100000000 -Maximum 999999999)
$env:NX_TEST_RUSTDESK_EXPECTED_APPDATA = $env:APPDATA
$env:NX_TEST_RUSTDESK_ID = $idServico
$env:NX_TEST_RUSTDESK_MARKER = Join-Path $pasta 'perfil-usado.txt'
$env:NX_TEST_RUSTDESK_FAIL_PASSWORD = '0'
$pastaServico = "$pasta-servico"
$oServico = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Instalar -Painel $base -ChaveAgente $key -Simular -Exe $mock -PastaDados $pastaServico 2>&1 | Out-String
Ok 'cadastro consulta o mesmo ID e mantém APPDATA do processo' ($oServico -match "ID do RustDesk: $idServico" -and (Get-Content $env:NX_TEST_RUSTDESK_MARKER -Raw).Trim() -eq $env:NX_TEST_RUSTDESK_EXPECTED_APPDATA)
$null = Api 'POST' '/api/admin/nextec/secrets/policy' @{ kind = 'peer'; ref = $idServico; enabled = $true; interval_minutes = 15 } $tok
$cfgAgente = Get-Content "$pastaServico\agente-senha.json" -Raw | ConvertFrom-Json
$cfgAgente.id = if ($idServico -eq '999999999') { '999999998' } else { '999999999' }
$cfgAgente | ConvertTo-Json | Set-Content "$pastaServico\agente-senha.json" -Encoding UTF8
$idDivergente = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Executar -Simular -Exe $mock -PastaDados $pastaServico 2>&1 | Out-String
Ok 'ID divergente interrompe a troca antes de falar com o painel' ($idDivergente -match 'vinculado ao ID')
$cfgAgente.id = $idServico
$cfgAgente | ConvertTo-Json | Set-Content "$pastaServico\agente-senha.json" -Encoding UTF8
$env:NX_TEST_RUSTDESK_FAIL_PASSWORD = '1'
$null = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Executar -Simular -Exe $mock -PastaDados $pastaServico 2>&1 | Out-String
$falha = (Api 'POST' '/api/admin/nextec/secrets/reveal' @{ id = $idServico } $tok).data
Ok 'falha ao aplicar senha não confirma uma senha ativa' (-not $falha.password -and $falha.pending.Length -eq 24)
$env:NX_TEST_RUSTDESK_FAIL_PASSWORD = '0'
$null = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Executar -Simular -Exe $mock -PastaDados $pastaServico 2>&1 | Out-String
$sucesso = (Api 'POST' '/api/admin/nextec/secrets/reveal' @{ id = $idServico } $tok).data
Ok 'aplicação bem sucedida confirma a senha no painel' ($sucesso.password.Length -eq 24 -and $sucesso.version -eq 1)
$null = Api 'POST' '/api/admin/nextec/secrets/unenroll' @{ id = $idServico } $tok
$null = Api 'POST' '/api/admin/nextec/secrets/policy' @{ kind = 'peer'; ref = $idServico; enabled = $false; interval_minutes = 15; remove = $true } $tok
Remove-Item $pastaServico -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $env:NX_TEST_RUSTDESK_MARKER -Force -ErrorAction SilentlyContinue
Remove-Item Env:NX_TEST_RUSTDESK_EXPECTED_APPDATA, Env:NX_TEST_RUSTDESK_ID, Env:NX_TEST_RUSTDESK_MARKER, Env:NX_TEST_RUSTDESK_FAIL_PASSWORD -ErrorAction SilentlyContinue

# instala (simulado) com o Windows PowerShell 5.1
$o1 = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Instalar -Painel $base -ChaveAgente $key -Simular -Id $id -PastaDados $pasta 2>&1 | Out-String
Ok 'instala e cadastra (PS 5.1)' ((Test-Path "$pasta\agente-senha.json") -and $o1 -match 'Cadastro conclu') $o1.Trim().Split("`n")[-1]
$cfg = Get-Content "$pasta\agente-senha.json" -Raw | ConvertFrom-Json
Ok 'token guardado protegido (não é hexadecimal puro)' ($cfg.token.Length -gt 100 -and $cfg.token -notmatch '^[0-9a-f]{64}$')

# sem regra: nada acontece
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Executar -Simular -Id $id -PastaDados $pasta 2>&1 | Out-Null
$ov = (Api 'GET' '/api/admin/nextec/secrets' $null $tok).data
$d = $ov.devices | Where-Object { $_.peer_id -eq $id }
Ok 'sem regra: aparece cadastrada e sem senha' ($d.enrolled -eq $true -and $d.has_password -eq $false)

# liga a regra e roda
$null = Api 'POST' '/api/admin/nextec/secrets/policy' @{ kind = 'peer'; ref = $id; enabled = $true; interval_minutes = 15 } $tok
$o2 = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Executar -Simular -Id $id -PastaDados $pasta 2>&1 | Out-String
$rv = (Api 'POST' '/api/admin/nextec/secrets/reveal' @{ id = $id } $tok).data
Ok 'com regra: primeira troca feita' ($rv.version -eq 1 -and $rv.password.Length -eq 24) $o2.Trim().Split("`n")[-1]
Ok 'senha só com letras e números' ($rv.password -match '^[A-Za-z0-9]{24}$')
$senha1 = $rv.password

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Executar -Simular -Id $id -PastaDados $pasta 2>&1 | Out-Null
$rv2 = (Api 'POST' '/api/admin/nextec/secrets/reveal' @{ id = $id } $tok).data
Ok 'segunda verificação: mesma senha (ainda não venceu)' ($rv2.password -eq $senha1 -and $rv2.version -eq 1)

$null = Api 'POST' '/api/admin/nextec/secrets/rotate' @{ id = $id } $tok
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Executar -Simular -Id $id -PastaDados $pasta 2>&1 | Out-Null
$rv3 = (Api 'POST' '/api/admin/nextec/secrets/reveal' @{ id = $id } $tok).data
Ok 'Trocar agora: senha nova e versão 2' ($rv3.password -ne $senha1 -and $rv3.version -eq 2)

# segunda instalação deve ser recusada
$ErrorActionPreference = 'Continue'; $o3 = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agente -Instalar -Painel $base -ChaveAgente $key -Simular -Id $id -PastaDados "$pasta-2" 2>&1 | Out-String; $ErrorActionPreference = 'Stop'
Ok 'instalar de novo é recusado com mensagem clara' ($o3 -match 'já está cadastrada') ($o3 -split "`n" | Select-String 'cadastrada' | Select-Object -First 1)

# registro local
$log = Get-Content "$pasta\agente-senha.log" -Raw
Ok 'log local registra as trocas e não mostra a senha' ($log -match 'Senha trocada' -and $log -notmatch [regex]::Escape($senha1) -and $log -notmatch [regex]::Escape($rv3.password))

# limpeza
$null = Api 'POST' '/api/admin/nextec/secrets/unenroll' @{ id = $id } $tok
$null = Api 'POST' '/api/admin/nextec/secrets/policy' @{ kind = 'peer'; ref = $id; enabled = $false; interval_minutes = 15; remove = $true } $tok
$null = Api 'POST' '/api/admin/nextec/secrets/unenroll' @{ id = 'VAULT999111' } $tok
Remove-Item $pasta, "$pasta-2" -Recurse -Force -ErrorAction SilentlyContinue
$res | Format-Table -AutoSize -Wrap | Out-String -Width 200
"Passaram: $(($res | Where-Object Passou).Count) de $($res.Count)"
