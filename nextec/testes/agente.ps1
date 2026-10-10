$ErrorActionPreference = 'Stop'
$base = 'http://localhost:21114'
$agente = 'C:\Users\Leonam Daris\Documents\Projetos Programacao\RustyDesk Admin\rustdesk-api-web\nextec\atualizacao\Agente-Senha-Nextec.ps1'
$pasta = 'C:\Temp\nx-agente-teste'
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

