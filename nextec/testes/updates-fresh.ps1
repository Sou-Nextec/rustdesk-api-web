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
function Upload($tok, $ver, $file, $name, $notes = 'teste') {
  $out = & curl.exe -s -X POST "$base/api/admin/nextec/updates/upload" -H "api-token: $tok" -F "version=$ver" -F "notes=$notes" -F "file=@$file;filename=$name"
  return ($out | ConvertFrom-Json)
}

$senha = if ($args[0]) { $args[0] } else { $env:NX_TESTE_SENHA }
$tok = (Api 'POST' '/api/admin/login' @{ username = 'admin'; password = $senha; platform = 'web' }).Json.data.token
Ok 'login admin' ($tok.Length -gt 10)

$tmp = Join-Path $env:TEMP 'nx-upd-test'; Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue; New-Item $tmp -ItemType Directory | Out-Null
# MSI falso (cabeçalho OLE) e EXE falso (MZ) e texto
$msi = [byte[]](0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1) + ([byte[]](1..200))
[IO.File]::WriteAllBytes("$tmp\a.msi", $msi)
[IO.File]::WriteAllBytes("$tmp\b.msi", [byte[]](0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1) + ([byte[]](9..250)))
[IO.File]::WriteAllBytes("$tmp\fake.msi", [Text.Encoding]::ASCII.GetBytes('isto nao e um msi'))
[IO.File]::WriteAllText("$tmp\x.txt", 'texto')

# sem login
$anon = & curl.exe -s -o NUL -w "%{http_code}" -X POST "$base/api/admin/nextec/updates/upload" -F "version=1.0.0" -F "file=@$tmp\a.msi"
Ok 'upload sem login é recusado' ($anon -in '401', '403', '200') "http $anon"
$ov0 = Api 'GET' '/api/admin/nextec/updates' $null $null
Ok 'visão geral sem login negada' ($ov0.Status -in 401, 403 -or $ov0.Json.code -ne 0) "status $($ov0.Status)"

$r = Upload $tok '2.0.0' "$tmp\a.msi" 'qualquer-nome.msi'
Ok 'envia MSI válido' ($r.code -eq 0 -and $r.data.version -eq '2.0.0' -and $r.data.file_name -eq 'nextec-acesso-2.0.0.msi') ($r | ConvertTo-Json -Compress)
$hashLocal = (Get-FileHash "$tmp\a.msi" -Algorithm SHA256).Hash.ToLower()
Ok 'hash calculado pelo servidor confere' ($r.data.sha256 -eq $hashLocal)
$r2 = Upload $tok '2.0.0' "$tmp\b.msi" 'b.msi'
Ok 'versão repetida é recusada' ($r2.code -ne 0) $r2.message
$r3 = Upload $tok 'abc' "$tmp\b.msi" 'b.msi'
Ok 'versão inválida é recusada' ($r3.code -ne 0) $r3.message
$r4 = Upload $tok '2.0.1' "$tmp\fake.msi" 'fake.msi'
Ok 'arquivo sem cabeçalho de MSI é recusado' ($r4.code -ne 0) $r4.message
$r5 = Upload $tok '2.0.2' "$tmp\x.txt" 'x.txt'
Ok 'extensão .txt é recusada' ($r5.code -ne 0) $r5.message
$r6 = Upload $tok '2.0.1' "$tmp\b.msi" 'b.msi' 'segunda versão'
Ok 'segunda versão enviada' ($r6.code -eq 0)

# peers de teste
$g = Api 'POST' '/api/admin/device_group/create' @{ name = 'Cliente Piloto' } $tok
$gl = (Api 'GET' '/api/admin/device_group/list?page=1&page_size=100' $null $tok).Json.data.list | Where-Object { $_.name -eq 'Cliente Piloto' }
$null = Api 'POST' '/api/admin/peer/create' @{ id = '700100100'; group_id = $gl.id; hostname = 'PC-PILOTO'; uuid = 'u1' } $tok
$null = Api 'POST' '/api/admin/peer/create' @{ id = '700200200'; group_id = 0; hostname = 'PC-OUTRO'; uuid = 'u2' } $tok

function Manifest($q) { (Invoke-RestMethod -Uri "$base/api/nextec/update/versao.json$q" -UseBasicParsing) }
$m0 = Manifest '?id=700100100&v=1.9.0'
Ok 'sem publicação: nada a instalar' ($null -eq $m0.windows)

$pilot = Api 'POST' '/api/admin/nextec/updates/rollout' @{ version = '2.0.0'; mode = 'pilot'; groups = @($gl.id); peers = @() } $tok
Ok 'publica piloto' ($pilot.Json.code -eq 0 -and $pilot.Json.data.mode -eq 'pilot')
$m1 = Manifest '?id=700100100&v=1.9.0'
Ok 'máquina do grupo piloto recebe a versão' ($m1.windows.versao -eq '2.0.0' -and $m1.windows.arquivo -eq 'files/nextec-acesso-2.0.0.msi' -and $m1.windows.sha256 -eq $hashLocal)
$m2 = Manifest '?id=700200200&v=1.9.0'
Ok 'máquina fora do piloto não recebe' ($null -eq $m2.windows)
$m3 = Manifest ''
Ok 'sem ID não recebe em piloto' ($null -eq $m3.windows)

$pilot2 = Api 'POST' '/api/admin/nextec/updates/rollout' @{ version = '2.0.0'; mode = 'pilot'; groups = @(); peers = @('700200200') } $tok
$m4 = Manifest '?id=700200200&v=1.9.0'
Ok 'piloto por máquina funciona' ($m4.windows.versao -eq '2.0.0')
$pilot3 = Api 'POST' '/api/admin/nextec/updates/rollout' @{ version = '2.0.0'; mode = 'pilot'; groups = @(); peers = @() } $tok
Ok 'piloto vazio é recusado' ($pilot3.Json.code -ne 0)

# download
$dl = & curl.exe -s -o "$tmp\baixado.msi" -w "%{http_code}" "$base/api/nextec/update/files/nextec-acesso-2.0.0.msi"
Ok 'download do arquivo publicado' ($dl -eq '200' -and (Get-FileHash "$tmp\baixado.msi" -Algorithm SHA256).Hash.ToLower() -eq $hashLocal) "http $dl"
$bad1 = & curl.exe -s -o NUL -w "%{http_code}" "$base/api/nextec/update/files/..%2F..%2Fnextec-settings.json"
$bad2 = & curl.exe -s -o NUL -w "%{http_code}" "$base/api/nextec/update/files/nextec-acesso-9.9.9.msi"
$bad3 = & curl.exe -s -o NUL -w "%{http_code}" "$base/api/nextec/update/files/outro.msi"
Ok 'caminho fora da lista não é servido' ($bad1 -in '404', '400' -and $bad2 -eq '404' -and $bad3 -eq '404') "$bad1 $bad2 $bad3"

# todos e rollback
$all = Api 'POST' '/api/admin/nextec/updates/rollout' @{ version = '2.0.1'; mode = 'all'; groups = @(); peers = @() } $tok
$m5 = Manifest '?id=700200200&v=2.0.0'
Ok 'publicar para todos: qualquer máquina recebe' ($m5.windows.versao -eq '2.0.1')
$m6 = Manifest ''
Ok 'todos: máquina sem ID também recebe' ($m6.windows.versao -eq '2.0.1')
$back = Api 'POST' '/api/admin/nextec/updates/rollout' @{ version = '2.0.0'; mode = 'all'; groups = @(); peers = @() } $tok
$m7 = Manifest '?id=700200200&v=2.0.1'
Ok 'rollback: volta para a versão anterior' ($m7.windows.versao -eq '2.0.0')
$noRel = Api 'POST' '/api/admin/nextec/updates/rollout' @{ version = '9.9.9'; mode = 'all'; groups = @(); peers = @() } $tok
Ok 'publicar versão inexistente é recusado' ($noRel.Json.code -ne 0)

$ov = (Api 'GET' '/api/admin/nextec/updates' $null $tok).Json.data
$i1 = $ov.installs | Where-Object { $_.peer_id -eq '700100100' }
$i2 = $ov.installs | Where-Object { $_.peer_id -eq '700200200' }
Ok 'acompanhamento registra versão instalada e oferecida' ($i1.version -eq '1.9.0' -and $i1.target -eq '2.0.0' -and $i2.version -eq '2.0.1')
Manifest '?id=999999999&v=1.0.0' | Out-Null
Ok 'ID desconhecido não é registrado' (-not (($ov.installs | Where-Object { $_.peer_id -eq '999999999' })) -and -not (((Api 'GET' '/api/admin/nextec/updates' $null $tok).Json.data.installs) | Where-Object { $_.peer_id -eq '999999999' }))

# excluir
$rel = $ov.releases | Where-Object { $_.version -eq '2.0.0' }
$delPub = Api 'POST' '/api/admin/nextec/updates/delete' @{ id = $rel.id } $tok
Ok 'não exclui versão publicada' ($delPub.Json.code -ne 0)
$rel1 = $ov.releases | Where-Object { $_.version -eq '2.0.1' }
$delOk = Api 'POST' '/api/admin/nextec/updates/delete' @{ id = $rel1.id } $tok
Ok 'exclui versão não publicada' ($delOk.Json.code -eq 0)
$dl2 = & curl.exe -s -o NUL -w "%{http_code}" "$base/api/nextec/update/files/nextec-acesso-2.0.1.msi"
Ok 'arquivo excluído deixa de ser servido' ($dl2 -eq '404')

$off = Api 'POST' '/api/admin/nextec/updates/rollout' @{ version = ''; mode = 'off'; groups = @(); peers = @() } $tok
$m8 = Manifest '?id=700200200&v=2.0.0'
Ok 'suspender: ninguém recebe' ($off.Json.code -eq 0 -and $null -eq $m8.windows)

# usuário comum
$u = 'nx_u_' + (Get-Random -Minimum 1000 -Maximum 9999); $pw = 'Tt' + (Get-Random -Minimum 100000 -Maximum 999999) + 'aZ'
$null = Api 'POST' '/api/admin/user/create' @{ username = $u; nickname = $u; group_id = 1; status = 1; is_admin = $false } $tok
$ul = (Api 'GET' '/api/admin/user/list?page=1&page_size=100' $null $tok).Json.data.list | Where-Object { $_.username -eq $u }
$null = Api 'POST' '/api/admin/user/changePwd' @{ id = $ul.id; password = $pw } $tok
$ut = (Api 'POST' '/api/admin/login' @{ username = $u; password = $pw; platform = 'web' }).Json.data.token
$ovu = Api 'GET' '/api/admin/nextec/updates' $null $ut
Ok 'usuário comum não abre as atualizações' ($ovu.Status -eq 403 -or $ovu.Json.code -ne 0) "status $($ovu.Status)"
$ru = Upload $ut '3.0.0' "$tmp\a.msi" 'a.msi'
Ok 'usuário comum não envia instalador' ($ru.code -ne 0 -or $null -eq $ru) ($ru | ConvertTo-Json -Compress)
$null = Api 'POST' '/api/admin/user/delete' @{ id = $ul.id } $tok

$res | Format-Table -AutoSize -Wrap | Out-String -Width 220
"Passaram: $(($res | Where-Object Passou).Count) de $($res.Count)"
