$ErrorActionPreference = 'Stop'
$base = 'http://localhost:21114'
$resultados = New-Object System.Collections.Generic.List[object]
function Ok($nome, $cond, $extra = '') { $resultados.Add([pscustomobject]@{ Teste = $nome; Passou = [bool]$cond; Detalhe = $extra }) }
function Call($method, $path, $body, $token) {
  $h = @{}
  if ($token) { $h['api-token'] = $token }
  try {
    $p = @{ Uri = "$base$path"; Method = $method; Headers = $h; ContentType = 'application/json'; UseBasicParsing = $true }
    if ($body) { $p['Body'] = ($body | ConvertTo-Json -Compress) }
    $r = Invoke-WebRequest @p
    return @{ Status = [int]$r.StatusCode; Json = ($r.Content | ConvertFrom-Json) }
  } catch {
    $resp = $_.Exception.Response
    $code = if ($resp) { [int]$resp.StatusCode } else { 0 }
    return @{ Status = $code; Json = $null }
  }
}

# login do admin local (senha de teste do ambiente local)
$login = Call 'POST' '/api/admin/login' @{ username = 'admin'; password = $env:NX_TESTE_SENHA; platform = 'web' } $null
$tok = $login.Json.data.token
Ok 'login admin' ($tok.Length -gt 10)

$id = 'T' + (Get-Random -Minimum 100000000 -Maximum 999999999)
$ov = Call 'GET' '/api/admin/nextec/secrets' $null $tok
Ok 'visão geral abre' ($ov.Status -eq 200)

$k = Call 'POST' '/api/admin/nextec/secrets/agent-key' @{} $tok
$key = $k.Json.data.key
Ok 'gera chave de cadastro' ($key.Length -ge 32)

$bad = Call 'POST' '/api/nextec/agent/enroll' @{ key = 'chave-errada'; id = $id } $null
Ok 'chave errada recusada (401)' ($bad.Status -eq 401)
$en = Call 'POST' '/api/nextec/agent/enroll' @{ key = $key; id = $id } $null
$agt = $en.Json.token
Ok 'cadastra a máquina' ($agt.Length -ge 32)
$en2 = Call 'POST' '/api/nextec/agent/enroll' @{ key = $key; id = $id } $null
Ok 'segundo cadastro recusado (409)' ($en2.Status -eq 409)

$s0 = Call 'POST' '/api/nextec/agent/sync' @{ id = $id; token = $agt } $null
Ok 'sem regra: não gerenciada' ($s0.Json.managed -eq $false)
$sbad = Call 'POST' '/api/nextec/agent/sync' @{ id = $id; token = 'token-errado' } $null
Ok 'token errado recusado (401)' ($sbad.Status -eq 401)

$pol = Call 'POST' '/api/admin/nextec/secrets/policy' @{ kind = 'peer'; ref = $id; enabled = $true; interval_minutes = 15 } $tok
Ok 'liga regra da máquina' ($pol.Status -eq 200 -and $pol.Json.code -eq 0)
$polBad = Call 'POST' '/api/admin/nextec/secrets/policy' @{ kind = 'peer'; ref = $id; enabled = $true; interval_minutes = 5 } $tok
Ok 'intervalo abaixo do mínimo recusado' ($polBad.Json.code -ne 0)

$s1 = Call 'POST' '/api/nextec/agent/sync' @{ id = $id; token = $agt } $null
Ok 'com regra: gerenciada e precisa trocar' ($s1.Json.managed -eq $true -and $s1.Json.rotate -eq $true)
Ok 'devolve os ajustes do app' ($s1.Json.approve_mode -eq 'password' -and $s1.Json.verification_method -eq 'use-permanent-password')

$pwBad = Call 'POST' '/api/nextec/agent/password' @{ id = $id; token = $agt; password = 'curta' } $null
Ok 'senha curta recusada (400)' ($pwBad.Status -eq 400)
$pwBad2 = Call 'POST' '/api/nextec/agent/password' @{ id = $id; token = $agt; password = 'abc def ghi jkl mno pqr' } $null
Ok 'senha com espaço recusada (400)' ($pwBad2.Status -eq 400)

$senha1 = 'Aa1' + (-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 21 | ForEach-Object { [char]$_ }))
$conf0 = Call 'POST' '/api/nextec/agent/confirm' @{ id = $id; token = $agt } $null
Ok 'confirmar sem proposta recusado' ($conf0.Status -eq 400)
$pw = Call 'POST' '/api/nextec/agent/password' @{ id = $id; token = $agt; password = $senha1 } $null
Ok 'guarda senha pendente' ($pw.Status -eq 200)
$rv0 = Call 'POST' '/api/admin/nextec/secrets/reveal' @{ id = $id } $tok
Ok 'pendente aparece para o admin (ainda não ativa)' ($rv0.Json.data.pending -eq $senha1 -and -not $rv0.Json.data.password)
$cf = Call 'POST' '/api/nextec/agent/confirm' @{ id = $id; token = $agt } $null
Ok 'confirma a troca' ($cf.Status -eq 200)

$s2 = Call 'POST' '/api/nextec/agent/sync' @{ id = $id; token = $agt } $null
Ok 'depois de confirmar: não precisa trocar' ($s2.Json.rotate -eq $false)

$rv = Call 'POST' '/api/admin/nextec/secrets/reveal' @{ id = $id } $tok
Ok 'admin vê a senha vigente' ($rv.Json.data.password -eq $senha1 -and $rv.Json.data.version -eq 1)

$lk = Call 'GET' "/api/admin/my/connect-link?id=$id" $null $tok
Ok 'link do admin leva a senha' ($lk.Json.data.url -eq "rustdesk://${id}?password=${senha1}" -and $lk.Json.data.auto_password -eq $true) $lk.Json.data.url.Replace($senha1, '***')

# usuário comum sem acesso à máquina
$uname = 'nx_t_' + (Get-Random -Minimum 1000 -Maximum 9999)
$upw = 'Tt' + (Get-Random -Minimum 100000 -Maximum 999999) + 'aZ'
$cu = Call 'POST' '/api/admin/user/create' @{ username = $uname; nickname = $uname; group_id = 1; status = 1; is_admin = $false } $tok
$ul = (Call 'GET' '/api/admin/user/list?page=1&page_size=100' $null $tok).Json.data.list | Where-Object { $_.username -eq $uname }
$null = Call 'POST' '/api/admin/user/changePwd' @{ id = $ul.id; password = $upw } $tok
$ulogin = Call 'POST' '/api/admin/login' @{ username = $uname; password = $upw; platform = 'web' } $null
$utok = $ulogin.Json.data.token
$lk2 = Call 'GET' "/api/admin/my/connect-link?id=$id" $null $utok
Ok 'usuário sem acesso: link negado (403)' ($lk2.Json.code -eq 403 -or $lk2.Status -eq 403) "status $($lk2.Status) code $($lk2.Json.code)"
$ov2 = Call 'GET' '/api/admin/nextec/secrets' $null $utok
Ok 'usuário comum não abre o cofre' ($ov2.Json.code -eq 403 -or $ov2.Status -eq 403)
$rv2 = Call 'POST' '/api/admin/nextec/secrets/reveal' @{ id = $id } $utok
Ok 'usuário comum não vê senha' ($rv2.Json.code -eq 403 -or $rv2.Status -eq 403)

# troca imediata
$rn = Call 'POST' '/api/admin/nextec/secrets/rotate' @{ id = $id } $tok
$s3 = Call 'POST' '/api/nextec/agent/sync' @{ id = $id; token = $agt } $null
Ok 'trocar agora faz o agente trocar' ($rn.Json.code -eq 0 -and $s3.Json.rotate -eq $true)

# desligar a regra
$off = Call 'POST' '/api/admin/nextec/secrets/policy' @{ kind = 'peer'; ref = $id; enabled = $false; interval_minutes = 15 } $tok
$s4 = Call 'POST' '/api/nextec/agent/sync' @{ id = $id; token = $agt } $null
Ok 'regra desligada: máquina deixa de ser gerenciada' ($s4.Json.managed -eq $false)
$lk3 = Call 'GET' "/api/admin/my/connect-link?id=$id" $null $tok
Ok 'regra desligada: link sem senha' ($lk3.Json.data.url -eq "rustdesk://${id}" -and $lk3.Json.data.auto_password -eq $false)

$au = Call 'GET' '/api/admin/nextec/secrets/audit' $null $tok
$acoes = ($au.Json.data.list | Where-Object { $_.peer_id -eq $id } | ForEach-Object { $_.action }) -join ','
Ok 'auditoria registra os eventos' ($acoes -match 'agent_enroll' -and $acoes -match 'rotated' -and $acoes -match 'reveal' -and $acoes -match 'connect') $acoes

# limpeza
$null = Call 'POST' '/api/admin/nextec/secrets/unenroll' @{ id = $id } $tok
$null = Call 'POST' '/api/admin/nextec/secrets/policy' @{ kind = 'peer'; ref = $id; enabled = $false; interval_minutes = 15; remove = $true } $tok
$null = Call 'POST' '/api/admin/user/delete' @{ id = $ul.id } $tok
"SENHA_TESTE=$senha1"
$resultados | Format-Table -AutoSize -Wrap | Out-String -Width 200
"Passaram: $(($resultados | Where-Object Passou).Count) de $($resultados.Count)"

