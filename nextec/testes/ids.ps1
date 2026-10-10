$ErrorActionPreference = 'Stop'
$base = 'http://localhost:21144'
$d = Split-Path -Parent $MyInvocation.MyCommand.Path
$pw = $env:NX_TESTE_SENHA
$res = New-Object System.Collections.Generic.List[object]
function Ok($n, $c, $x = '') { $res.Add([pscustomobject]@{ Teste = $n; Passou = [bool]$c; Detalhe = $x }) }
function Api($m, $p, $b, $t) {
  $h = @{}; if ($t) { $h['api-token'] = $t }
  $x = @{ Uri = "$base$p"; Method = $m; Headers = $h; ContentType = 'application/json; charset=utf-8'; UseBasicParsing = $true }
  if ($null -ne $b) { $x['Body'] = [Text.Encoding]::UTF8.GetBytes(($b | ConvertTo-Json -Compress -Depth 6)) }
  try { $r = Invoke-WebRequest @x; return [pscustomobject]@{ Status = [int]$r.StatusCode; Json = ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json) } }
  catch { return [pscustomobject]@{ Status = 0; Json = $null } }
}
$tok = (Api 'POST' '/api/admin/login' @{ username = 'admin'; password = $pw; platform = 'web' }).Json.data.token
Ok 'login admin' ($tok.Length -gt 10)

# criar dispositivo com espaços no ID
$c = Api 'POST' '/api/admin/peer/create' @{ id = '536 822 159'; hostname = 'SERVIDOR'; uuid = 'ids-1' } $tok
$list = (Api 'GET' '/api/admin/peer/list?page=1&page_size=100' $null $tok).Json.data.list
Ok 'criar com espaços grava sem espaços' ($c.Json.code -eq 0 -and ($list | Where-Object { $_.id -eq '536822159' }) -and -not ($list | Where-Object { $_.id -match ' ' }))

# editar trocando por ID com espaços
$p = $list | Where-Object { $_.id -eq '536822159' }
$u = Api 'POST' '/api/admin/peer/update' @{ row_id = $p.row_id; id = '123 456 789'; hostname = 'SERVIDOR' } $tok
$list2 = (Api 'GET' '/api/admin/peer/list?page=1&page_size=100' $null $tok).Json.data.list
Ok 'editar com espaços grava sem espaços' ($u.Json.code -eq 0 -and ($list2 | Where-Object { $_.id -eq '123456789' }))

# o app envia sem espaços: sysinfo e heartbeat continuam casando
$s = Invoke-WebRequest "$base/api/sysinfo" -Method Post -ContentType 'application/json' -Body (@{ id = '268304385'; uuid = 'ids-2'; hostname = 'PC'; username = 'u'; os = 'windows'; version = '1.5.0' } | ConvertTo-Json) -UseBasicParsing
Ok 'sysinfo do app continua funcionando' ($s.Content -eq 'SYSINFO_UPDATED')
$h = Api 'POST' '/api/heartbeat' @{ id = '268304385'; uuid = 'ids-2'; ver = 1005000 } $null
$list3 = (Api 'GET' '/api/admin/peer/list?page=1&page_size=100' $null $tok).Json.data.list
$pp = $list3 | Where-Object { $_.id -eq '268304385' }
Ok 'heartbeat marca online o ID sem espaços' ($pp.last_online_time -gt 0)

# acesso salvo com espaços
$ab = Api 'POST' '/api/admin/address_book/create' @{ id = '700 800 900'; user_id = 1; hostname = 'X'; alias = 'teste' } $tok
$abl = (Api 'GET' '/api/admin/address_book/list?page=1&page_size=100' $null $tok).Json.data.list
Ok 'acesso salvo com espaços grava sem espaços' ($ab.Json.code -eq 0 -and ($abl | Where-Object { $_.id -eq '700800900' }))

# link de conexão com ID formatado
$lk = Api 'GET' '/api/admin/my/connect-link?id=268304385' $null $tok
Ok 'link de conexão do ID sem espaços' ($lk.Json.data.url -eq 'rustdesk://268304385')

$res | Format-Table -AutoSize -Wrap | Out-String -Width 200
"Passaram: $(($res | Where-Object Passou).Count) de $($res.Count)"
