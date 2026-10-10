$ErrorActionPreference = 'Stop'
$base = 'http://localhost:21114'
$res = New-Object System.Collections.Generic.List[object]
function Ok($n, $c, $d = '') { $res.Add([pscustomobject]@{ Teste = $n; Passou = [bool]$c; Detalhe = $d }) }
function Api($m, $p, $b, $t) {
  $h = @{}; if ($t) { $h['api-token'] = $t }
  $x = @{ Uri = "$base$p"; Method = $m; Headers = $h; ContentType = 'application/json; charset=utf-8'; UseBasicParsing = $true }
  if ($null -ne $b) { $x['Body'] = [Text.Encoding]::UTF8.GetBytes(($b | ConvertTo-Json -Compress -Depth 6)) }
  try { $r = Invoke-WebRequest @x; return [pscustomobject]@{ Status = [int]$r.StatusCode; Json = ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json) } }
  catch { $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }; return [pscustomobject]@{ Status = $code; Json = $null } }
}
$tok = (Api 'POST' '/api/admin/login' @{ username = 'admin'; password = $env:NX_TESTE_SENHA; platform = 'web' }).Json.data.token
Ok 'login admin' ($tok.Length -gt 10)

# garante um dispositivo novo, online agora, sem cliente
$null = Api 'POST' '/api/sysinfo' @{ id = '930000001'; uuid = 'fila-uuid-1'; hostname = 'PC-FILA'; username = 'u'; os = 'windows'; version = '1.4.9' } $null
$null = Api 'POST' '/api/heartbeat' @{ id = '930000001'; uuid = 'fila-uuid-1'; ver = 1004009 } $null
# usuário comum
$u = 'nx_f_' + (Get-Random -Minimum 1000 -Maximum 9999); $pw = 'Tt' + (Get-Random -Minimum 100000 -Maximum 999999) + 'aZ'
$null = Api 'POST' '/api/admin/user/create' @{ username = $u; nickname = $u; group_id = 1; status = 1; is_admin = $false } $tok
$ul = (Api 'GET' '/api/admin/user/list?page=1&page_size=100' $null $tok).Json.data.list | Where-Object { $_.username -eq $u }
$null = Api 'POST' '/api/admin/user/changePwd' @{ id = $ul.id; password = $pw } $tok
$ut = (Api 'POST' '/api/admin/login' @{ username = $u; password = $pw; platform = 'web' }).Json.data.token

function Fila($t) { (Api 'GET' '/api/admin/my/support/waiting' $null $t).Json.data }

$info = (Api 'GET' '/api/admin/nextec/support' $null $tok).Json.data
Ok 'padrão novo: só administradores' ($info.waiting_mode -eq 'admins') $info.waiting_mode
$fa = Fila $tok; $fu = Fila $ut
Ok 'admins: administrador vê a lista' ($fa.enabled -eq $true -and ($fa.list | Where-Object { $_.id -eq '930000001' }))
Ok 'admins: usuário comum não recebe dados' ($fu.enabled -eq $false -and $fu.list.Count -eq 0 -and $fu.has_app -eq $false)

$r1 = Api 'POST' '/api/admin/nextec/support/settings' @{ waiting_mode = 'all' } $tok
$fu2 = Fila $ut
Ok 'all: usuário comum passa a ver' ($r1.Json.code -eq 0 -and $fu2.enabled -eq $true -and ($fu2.list | Where-Object { $_.id -eq '930000001' }))

$r2 = Api 'POST' '/api/admin/nextec/support/settings' @{ waiting_mode = 'off' } $tok
$fa3 = Fila $tok; $fu3 = Fila $ut
Ok 'off: ninguém vê, nem o administrador' ($r2.Json.code -eq 0 -and $fa3.enabled -eq $false -and $fa3.list.Count -eq 0 -and $fu3.enabled -eq $false)

$bad = Api 'POST' '/api/admin/nextec/support/settings' @{ waiting_mode = 'qualquer' } $tok
Ok 'valor inválido é recusado' ($bad.Json.code -ne 0)
$forb = Api 'POST' '/api/admin/nextec/support/settings' @{ waiting_mode = 'all' } $ut
Ok 'usuário comum não altera a regra' ($forb.Json.code -ne 0)
$anon = Api 'GET' '/api/admin/my/support/waiting' $null $null
Ok 'sem login nada sai' ($anon.Json.code -ne 0)

$null = Api 'POST' '/api/admin/nextec/support/settings' @{ waiting_mode = 'admins' } $tok
$back = (Api 'GET' '/api/admin/nextec/support' $null $tok).Json.data.waiting_mode
Ok 'volta ao padrão' ($back -eq 'admins')
$null = Api 'POST' '/api/admin/user/delete' @{ id = $ul.id } $tok

$res | Format-Table -AutoSize -Wrap | Out-String -Width 200
"Passaram: $(($res | Where-Object Passou).Count) de $($res.Count)"
