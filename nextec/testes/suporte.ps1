$ErrorActionPreference = 'Stop'
$base = 'http://localhost:21144'
$res = New-Object System.Collections.Generic.List[object]
function Ok($n, $c, $d = '') { $res.Add([pscustomobject]@{ Teste = $n; Passou = [bool]$c; Detalhe = $d }) }
function Api($m, $p, $b, $t) {
  $h = @{}; if ($t) { $h['api-token'] = $t }
  $x = @{ Uri = "$base$p"; Method = $m; Headers = $h; ContentType = 'application/json; charset=utf-8'; UseBasicParsing = $true }
  if ($b) { $x['Body'] = [Text.Encoding]::UTF8.GetBytes(($b | ConvertTo-Json -Compress -Depth 5)) }
  try { $r = Invoke-WebRequest @x; return [pscustomobject]@{ Status = [int]$r.StatusCode; Json = ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json) } }
  catch { $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }; return [pscustomobject]@{ Status = $code; Json = $null } }
}
function Upload($tok, $file, $name) { (& curl.exe -s -X POST "$base/api/admin/nextec/support/upload" -H "api-token: $tok" -F "file=@$file;filename=$name") | ConvertFrom-Json }

$tok = (Api 'POST' '/api/admin/login' @{ username = 'admin'; password = $env:NX_TESTE_SENHA; platform = 'web' }).Json.data.token
Ok 'login admin' ($tok.Length -gt 10)
$tmp = Join-Path $env:TEMP 'nx-sup-test'; Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue; New-Item $tmp -ItemType Directory | Out-Null
[IO.File]::WriteAllBytes("$tmp\ok.exe", [byte[]](0x4D, 0x5A) + ([byte[]](1..200)) )
[IO.File]::WriteAllBytes("$tmp\fake.exe", [Text.Encoding]::ASCII.GetBytes('nao e exe'))
[IO.File]::WriteAllText("$tmp\x.txt", 'texto')

# limpa estado de execuções anteriores
$null = Api 'POST' '/api/admin/nextec/support/delete' @{} $tok

# sem app
$p0 = (& curl.exe -s "$base/suporte")
Ok 'página sem app avisa indisponível' ($p0 -match 'não está disponível' -and $p0 -notmatch 'Baixar o aplicativo')
$d0 = & curl.exe -s -o NUL -w "%{http_code}" "$base/suporte/baixar"
Ok 'download sem app é 404' ($d0 -eq '404')
$w0 = (Api 'GET' '/api/admin/my/support/waiting' $null $tok).Json.data
Ok 'lista informa que não há app' ($w0.has_app -eq $false)

# uploads
$r1 = Upload $tok "$tmp\x.txt" 'x.txt'
$r2 = Upload $tok "$tmp\fake.exe" 'fake.exe'
Ok 'recusa extensão errada e arquivo sem cabeçalho MZ' ($r1.code -ne 0 -and $r2.code -ne 0) "$($r1.message) | $($r2.message)"
$r3 = Upload $tok "$tmp\ok.exe" 'qualquer.exe'
Ok 'aceita exe válido' ($r3.code -eq 0 -and $r3.data.size -eq 202)
$hash = (Get-FileHash "$tmp\ok.exe" -Algorithm SHA256).Hash.ToLower()
Ok 'hash confere' ($r3.data.sha256 -eq $hash)

# página e download
$hdr = (& curl.exe -s -D - -o "$tmp\pagina.html" "$base/suporte") -join "`n"
$pg = Get-Content "$tmp\pagina.html" -Raw -Encoding UTF8
Ok 'página com botão de download' ($pg -match 'href="/suporte/baixar"' -and $pg -match 'Suporte-Nextec.exe')
Ok 'cabeçalhos de segurança da página' ($hdr -match 'Content-Security-Policy' -and $hdr -match 'nosniff' -and $hdr -match 'no-store')
$h2 = (& curl.exe -s -D - -o "$tmp\baixado.exe" "$base/suporte/baixar") -join "`n"
Ok 'download entrega o arquivo com o nome certo' ((Get-FileHash "$tmp\baixado.exe" -Algorithm SHA256).Hash.ToLower() -eq $hash -and $h2 -match 'Suporte-Nextec.exe')

# aguardando atendimento: dispositivo novo, online agora, sem cliente
$null = Api 'POST' '/api/admin/peer/create' @{ id = '800100100'; hostname = 'PC-DO-CLIENTE'; username = 'maria'; os = 'windows / Windows 11'; uuid = 'sup-uuid-1'; group_id = 0 } $tok
$null = Api 'POST' '/api/heartbeat' @{ id = '800100100'; uuid = 'sup-uuid-1' } $null
$w1 = (Api 'GET' '/api/admin/my/support/waiting' $null $tok).Json.data
$item = $w1.list | Where-Object { $_.id -eq '800100100' }
Ok 'dispositivo novo online aparece aguardando' ($null -ne $item -and $item.hostname -eq 'PC-DO-CLIENTE' -and $w1.has_app -eq $true)

# deixa de aparecer quando ganha cliente
$gl = (Api 'GET' '/api/admin/device_group/list?page=1&page_size=100' $null $tok).Json.data.list | Select-Object -First 1
$peer = (Api 'GET' '/api/admin/peer/list?page=1&page_size=100' $null $tok).Json.data.list | Where-Object { $_.id -eq '800100100' }
$null = Api 'POST' '/api/admin/peer/update' @{ row_id = $peer.row_id; id = '800100100'; group_id = $gl.id; hostname = 'PC-DO-CLIENTE'; uuid = 'sup-uuid-1' } $tok
$w2 = (Api 'GET' '/api/admin/my/support/waiting' $null $tok).Json.data
Ok 'ao vincular a um cliente sai da lista' (-not ($w2.list | Where-Object { $_.id -eq '800100100' }))

# permissões
$anon = Api 'GET' '/api/admin/my/support/waiting' $null $null
Ok 'lista sem login é negada' ($anon.Json.code -ne 0)
$u = 'nx_s_' + (Get-Random -Minimum 1000 -Maximum 9999); $pw = 'Tt' + (Get-Random -Minimum 100000 -Maximum 999999) + 'aZ'
$null = Api 'POST' '/api/admin/user/create' @{ username = $u; nickname = $u; group_id = 1; status = 1; is_admin = $false } $tok
$ul = (Api 'GET' '/api/admin/user/list?page=1&page_size=100' $null $tok).Json.data.list | Where-Object { $_.username -eq $u }
$null = Api 'POST' '/api/admin/user/changePwd' @{ id = $ul.id; password = $pw } $tok
$ut = (Api 'POST' '/api/admin/login' @{ username = $u; password = $pw; platform = 'web' }).Json.data.token
$wu = Api 'GET' '/api/admin/my/support/waiting' $null $ut
Ok 'usuário comum vê a lista de aguardando' ($wu.Json.code -eq 0)
$ru = Upload $ut "$tmp\ok.exe" 'ok.exe'
Ok 'usuário comum não envia o app' ($ru.code -ne 0)
$du = Api 'POST' '/api/admin/nextec/support/delete' @{} $ut
Ok 'usuário comum não tira o app do ar' ($du.Json.code -ne 0)
$iu = Api 'GET' '/api/admin/nextec/support' $null $ut
Ok 'usuário comum não abre a administração' ($iu.Json.code -ne 0)
$null = Api 'POST' '/api/admin/user/delete' @{ id = $ul.id } $tok

# tirar do ar
$del = Api 'POST' '/api/admin/nextec/support/delete' @{} $tok
$p3 = (& curl.exe -s "$base/suporte")
$d3 = & curl.exe -s -o NUL -w "%{http_code}" "$base/suporte/baixar"
Ok 'tirar do ar volta a página para indisponível' ($del.Json.code -eq 0 -and $p3 -match 'não está disponível' -and $d3 -eq '404')

$res | Format-Table -AutoSize -Wrap | Out-String -Width 220
"Passaram: $(($res | Where-Object Passou).Count) de $($res.Count)"

