$ErrorActionPreference = 'Stop'
$base = 'http://localhost:21114'
$res = New-Object System.Collections.Generic.List[object]
function Ok($n, $c, $d = '') { $res.Add([pscustomobject]@{ Teste = $n; Passou = [bool]$c; Detalhe = $d }) }
function Api($m, $p, $b, $t) {
  $h = @{}; if ($t) { $h['api-token'] = $t }
  $x = @{ Uri = "$base$p"; Method = $m; Headers = $h; ContentType = 'application/json; charset=utf-8'; UseBasicParsing = $true }
  if ($null -ne $b) { $x['Body'] = [Text.Encoding]::UTF8.GetBytes(($b | ConvertTo-Json -Compress -Depth 6)) }
  try { $r = Invoke-WebRequest @x; $txt = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()); $j = $null; try { $j = $txt | ConvertFrom-Json } catch {}; return [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $j; Text = $txt } }
  catch { $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }; return [pscustomobject]@{ Status = $code; Json = $null; Text = '' } }
}
$senha = if ($args[0]) { $args[0] } else { $env:NX_TESTE_SENHA }
$tok = (Api 'POST' '/api/admin/login' @{ username = 'admin'; password = $senha; platform = 'web' }).Json.data.token
Ok 'login admin' ($tok.Length -gt 10)

function Sysinfo($id, $uuid, $nome) { Api 'POST' '/api/sysinfo' @{ id = $id; uuid = $uuid; hostname = $nome; username = 'u'; os = 'windows'; version = '1.4.9' } $null }
function Heartbeat($id, $uuid, $mod, $conns) { $b = @{ id = $id; uuid = $uuid; ver = 1004009; modified_at = $mod }; if ($conns) { $b['conns'] = $conns }; (Api 'POST' '/api/heartbeat' $b $null).Json }

# ===== instalação por cliente =====
$null = Api 'POST' '/api/admin/device_group/create' @{ name = 'Cliente Alfa' } $tok
$null = Api 'POST' '/api/admin/device_group/create' @{ name = 'Cliente Alfa / Servidores' } $tok
$null = Api 'POST' '/api/admin/device_group/create' @{ name = 'Cliente Beta' } $tok
$gl = (Api 'GET' '/api/admin/device_group/list?page=1&page_size=100' $null $tok).Json.data.list
$alfa = ($gl | Where-Object { $_.name -eq 'Cliente Alfa' }).id
$alfaSrv = ($gl | Where-Object { $_.name -eq 'Cliente Alfa / Servidores' }).id
$beta = ($gl | Where-Object { $_.name -eq 'Cliente Beta' }).id
$tA = (Api 'GET' "/api/admin/nextec/install-token?group_id=$alfa" $null $tok).Json.data.token
$tB = (Api 'GET' "/api/admin/nextec/install-token?group_id=$beta" $null $tok).Json.data.token
Ok 'chave de instalação por cliente é diferente' ($tA.Length -eq 32 -and $tB.Length -eq 32 -and $tA -ne $tB)
$tNo = Api 'GET' '/api/admin/nextec/install-token?group_id=99999' $null $tok
Ok 'cliente inexistente não gera chave' ($tNo.Json.code -ne 0)

$a1 = Api 'POST' '/api/nextec/install/assign' @{ id = '910000001'; group = $alfa; token = $tA } $null
Ok 'máquina nova fica pendente' ($a1.Json.state -eq 'pending')
$null = Sysinfo '910000001' 'uuid-a1' 'PC-A1'
$p1 = (Api 'GET' '/api/admin/peer/list?page=1&page_size=200' $null $tok).Json.data.list | Where-Object { $_.id -eq '910000001' }
Ok 'ao registrar, entra no cliente do comando' ($p1.group_id -eq $alfa)

$null = Sysinfo '910000002' 'uuid-a2' 'PC-A2'
$a2 = Api 'POST' '/api/nextec/install/assign' @{ id = '910000002'; group = $alfa; token = $tA } $null
$p2 = (Api 'GET' '/api/admin/peer/list?page=1&page_size=200' $null $tok).Json.data.list | Where-Object { $_.id -eq '910000002' }
Ok 'máquina já registrada sem cliente é atribuída na hora' ($a2.Json.state -eq 'assigned' -and $p2.group_id -eq $alfa)

$a3 = Api 'POST' '/api/nextec/install/assign' @{ id = '910000002'; group = $beta; token = $tB } $null
$p2b = (Api 'GET' '/api/admin/peer/list?page=1&page_size=200' $null $tok).Json.data.list | Where-Object { $_.id -eq '910000002' }
Ok 'máquina que já tem cliente não é movida' ($a3.Json.state -eq 'kept' -and $p2b.group_id -eq $alfa)

$bad = Api 'POST' '/api/nextec/install/assign' @{ id = '910000003'; group = $alfa; token = $tB } $null
Ok 'chave de outro cliente é recusada' ($bad.Status -eq 401)
$bad2 = Api 'POST' '/api/nextec/install/assign' @{ id = '910000003'; group = $alfa; token = '' } $null
Ok 'chave vazia é recusada' ($bad2.Status -eq 401)

# ===== políticas =====
$null = Sysinfo '910000010' 'uuid-p10' 'PC-POL'
$null = Api 'POST' '/api/nextec/install/assign' @{ id = '910000010'; group = $alfaSrv; token = (Api 'GET' "/api/admin/nextec/install-token?group_id=$alfaSrv" $null $tok).Json.data.token } $null
$h0 = Heartbeat '910000010' 'uuid-p10' 0 $null
Ok 'sem política: heartbeat não traz estratégia' ($null -eq $h0.strategy -and $null -eq $h0.modified_at)

$pol = Api 'POST' '/api/admin/nextec/policies' @{ kind = 'group'; ref = "$alfa"; enabled = $true; options = @{ 'enable-file-transfer' = 'N'; 'enable-terminal' = 'N'; 'enable-audio' = '' } } $tok
Ok 'cria política do cliente' ($pol.Json.code -eq 0)
$h1 = Heartbeat '910000010' 'uuid-p10' 0 $null
$mod = $h1.modified_at
Ok 'subgrupo herda a política do cliente' ($h1.strategy.config_options.'enable-file-transfer' -eq 'N' -and $h1.strategy.config_options.'enable-terminal' -eq 'N' -and $mod -gt 0)
Ok 'opções não definidas voltam ao padrão (vazio)' ($h1.strategy.config_options.'enable-audio' -eq '' -and $h1.strategy.config_options.'enable-clipboard' -eq '')
$h2 = Heartbeat '910000010' 'uuid-p10' $mod $null
Ok 'app já está atualizado: nada a enviar' ($null -eq $h2.strategy)

$bw = Api 'POST' '/api/admin/nextec/policies' @{ kind = 'group'; ref = "$alfa"; enabled = $true; options = @{ 'approve-mode' = 'click' } } $tok
Ok 'opção fora da lista é recusada' ($bw.Json.code -ne 0)
$bw2 = Api 'POST' '/api/admin/nextec/policies' @{ kind = 'group'; ref = "$alfa"; enabled = $true; options = @{ 'enable-file-transfer' = 'talvez' } } $tok
Ok 'valor inválido é recusado' ($bw2.Json.code -ne 0)
$bw3 = Api 'POST' '/api/admin/nextec/policies' @{ kind = 'group'; ref = '99999'; enabled = $true; options = @{} } $tok
Ok 'cliente inexistente é recusado' ($bw3.Json.code -ne 0)

$null = Api 'POST' '/api/admin/nextec/policies' @{ kind = 'peer'; ref = '910000010'; enabled = $true; options = @{ 'enable-file-transfer' = 'Y' } } $tok
$h3 = Heartbeat '910000010' 'uuid-p10' $mod $null
Ok 'regra da máquina vale mais que a do cliente' ($h3.strategy.config_options.'enable-file-transfer' -eq 'Y' -and $h3.strategy.config_options.'enable-terminal' -eq '' -and $h3.modified_at -ne $mod)

$hbad = Heartbeat '910000010' 'uuid-errado' 0 $null
Ok 'uuid diferente não recebe estratégia' ($null -eq $hbad.strategy)

$null = Api 'POST' '/api/admin/nextec/policies' @{ kind = 'peer'; ref = '910000010'; enabled = $false; options = @{}; remove = $true } $tok
$h4 = Heartbeat '910000010' 'uuid-p10' $h3.modified_at $null
Ok 'removida a da máquina, volta a do cliente' ($h4.strategy.config_options.'enable-file-transfer' -eq 'N')
$null = Api 'POST' '/api/admin/nextec/policies' @{ kind = 'group'; ref = "$alfa"; enabled = $false; options = @{ 'enable-file-transfer' = 'N' } } $tok
$h5 = Heartbeat '910000010' 'uuid-p10' $h4.modified_at $null
Ok 'sem regra ligada: app volta ao padrão e carimbo zera' ($h5.modified_at -eq 0 -and $h5.strategy.config_options.'enable-file-transfer' -eq '')
$h6 = Heartbeat '910000010' 'uuid-p10' 0 $null
Ok 'depois de zerar, nada mais é enviado' ($null -eq $h6.strategy)

# ===== conexões ativas =====
$null = Api 'POST' '/api/audit/conn' @{ action = 'new'; id = '910000010'; conn_id = 7; peer = @('555000111', 'tecnico'); ip = '10.0.0.5'; type = 0; uuid = 'uuid-p10'; session_id = 1.5 } $null
$null = Heartbeat '910000010' 'uuid-p10' 0 @(7)
$s1 = (Api 'GET' '/api/admin/nextec/sessions' $null $tok).Json.data.list
$ss = $s1 | Where-Object { $_.peer_id -eq '910000010' -and $_.conn_id -eq 7 }
Ok 'conexão aberta aparece com quem conectou' ($null -ne $ss -and $ss.from_name -eq 'tecnico' -and $ss.hostname -eq 'PC-POL')
$bd = Api 'POST' '/api/admin/nextec/sessions/disconnect' @{ peer_id = '910000010'; conn_id = 99 } $tok
Ok 'derrubar conexão que não existe é recusado' ($bd.Json.code -ne 0)
$dd = Api 'POST' '/api/admin/nextec/sessions/disconnect' @{ peer_id = '910000010'; conn_id = 7 } $tok
Ok 'pede para derrubar a conexão' ($dd.Json.code -eq 0)
$hx = Heartbeat '910000010' 'uuid-errado' 0 @(7)
Ok 'quem não prova o uuid não consome a ordem' ($null -eq $hx.disconnect)
$hd = Heartbeat '910000010' 'uuid-p10' 0 @(7)
Ok 'o app recebe a ordem de desconectar' ($hd.disconnect -contains 7)
$hd2 = Heartbeat '910000010' 'uuid-p10' 0 @(7)
Ok 'a ordem é entregue uma vez só' ($null -eq $hd2.disconnect)
$null = Heartbeat '910000010' 'uuid-p10' 0 $null
$s2 = (Api 'GET' '/api/admin/nextec/sessions' $null $tok).Json.data.list
Ok 'conexão encerrada sai da lista' (-not ($s2 | Where-Object { $_.peer_id -eq '910000010' }))

# ===== chamado e relatório =====
$ts0 = Api 'GET' '/api/admin/my/connect-settings' $null $tok
Ok 'por padrão não pede chamado' ($ts0.Json.data.mode -eq 'off')
$tsb = Api 'POST' '/api/admin/nextec/ticket-settings' @{ mode = 'optional'; jira_base = 'javascript:alert(1)' } $tok
Ok 'endereço do Jira fora de https é recusado' ($tsb.Json.code -ne 0)
$tsb2 = Api 'POST' '/api/admin/nextec/ticket-settings' @{ mode = 'required'; jira_base = 'https://nextec.atlassian.net/browse/' } $tok
Ok 'salva modo e endereço do Jira' ($tsb2.Json.code -eq 0 -and $tsb2.Json.data.mode -eq 'required')
$n0 = Api 'POST' '/api/admin/my/connect-note' @{ id = '910000010'; ticket = '' } $tok
Ok 'modo obrigatório recusa chamado vazio' ($n0.Json.code -ne 0)
$n1 = Api 'POST' '/api/admin/my/connect-note' @{ id = '910000010'; ticket = 'x y;drop' } $tok
Ok 'chamado com caracteres inválidos é recusado' ($n1.Json.code -ne 0)
$n2 = Api 'POST' '/api/admin/my/connect-note' @{ id = '910 000 010'; ticket = 'cbq-req-6054'; note = 'troca de impressora' } $tok
Ok 'registra chamado (ID com espaços e minúsculas)' ($n2.Json.code -eq 0)
$null = Api 'POST' '/api/audit/conn' @{ action = 'new'; id = '910000010'; conn_id = 8; peer = @('555000111', 'tecnico'); ip = '10.0.0.5'; type = 0; uuid = 'uuid-p10'; session_id = 2.5 } $null
$null = Api 'POST' '/api/audit/conn' @{ action = 'close'; id = '910000010'; conn_id = 8 } $null
$mes = (Get-Date).ToString('yyyy-MM')
$rp = Api 'GET' "/api/admin/nextec/report?month=$mes" $null $tok
$row = $rp.Json.data.list | Where-Object { $_.peer_id -eq '910000010' -and $_.ticket -eq 'CBQ-REQ-6054' }
Ok 'relatório cruza a conexão com o chamado' ($null -ne $row -and $row.note -eq 'troca de impressora' -and $row.machine -eq 'PC-POL' -and $row.client -eq 'Cliente Alfa / Servidores') ($rp.Json.data.list.Count)
$rpf = Api 'GET' "/api/admin/nextec/report?month=$mes&group_id=$alfa" $null $tok
Ok 'filtro por cliente inclui subgrupos' (($rpf.Json.data.list | Where-Object { $_.peer_id -eq '910000010' }).Count -ge 1)
$rpg = Api 'GET' "/api/admin/nextec/report?month=$mes&group_id=$beta" $null $tok
Ok 'filtro por outro cliente não traz a conexão' (($rpg.Json.data.list | Where-Object { $_.peer_id -eq '910000010' }).Count -eq 0)
$rpb = Api 'GET' '/api/admin/nextec/report?month=2026-13' $null $tok
Ok 'mês inválido é recusado' ($rpb.Json.code -ne 0)
$rpo = Api 'GET' '/api/admin/nextec/report?month=2020-01' $null $tok
Ok 'mês sem conexões devolve lista vazia' ($rpo.Json.code -eq 0 -and $rpo.Json.data.list.Count -eq 0)
$null = Api 'POST' '/api/admin/nextec/ticket-settings' @{ mode = 'off'; jira_base = '' } $tok

# ===== permissões =====
$u = 'nx_c_' + (Get-Random -Minimum 1000 -Maximum 9999); $pw = 'Tt' + (Get-Random -Minimum 100000 -Maximum 999999) + 'aZ'
$null = Api 'POST' '/api/admin/user/create' @{ username = $u; nickname = $u; group_id = 1; status = 1; is_admin = $false } $tok
$ul = (Api 'GET' '/api/admin/user/list?page=1&page_size=100' $null $tok).Json.data.list | Where-Object { $_.username -eq $u }
$null = Api 'POST' '/api/admin/user/changePwd' @{ id = $ul.id; password = $pw } $tok
$ut = (Api 'POST' '/api/admin/login' @{ username = $u; password = $pw; platform = 'web' }).Json.data.token
$forb = @(
  (Api 'GET' '/api/admin/nextec/policies' $null $ut), (Api 'POST' '/api/admin/nextec/policies' @{ kind = 'peer'; ref = '1'; enabled = $true; options = @{} } $ut),
  (Api 'GET' '/api/admin/nextec/sessions' $null $ut), (Api 'POST' '/api/admin/nextec/sessions/disconnect' @{ peer_id = '910000010'; conn_id = 7 } $ut),
  (Api 'GET' "/api/admin/nextec/report?month=$mes" $null $ut), (Api 'GET' "/api/admin/nextec/install-token?group_id=$alfa" $null $ut),
  (Api 'POST' '/api/admin/nextec/install-token/revoke' @{} $ut), (Api 'POST' '/api/admin/nextec/ticket-settings' @{ mode = 'off' } $ut)
)
Ok 'usuário comum não acessa nenhuma tela de administração nova' (-not ($forb | Where-Object { $_.Json.code -eq 0 })) "$(($forb | Where-Object { $_.Json.code -eq 0 }).Count) liberadas"
$cs = Api 'GET' '/api/admin/my/connect-settings' $null $ut
$cn = Api 'POST' '/api/admin/my/connect-note' @{ id = '910000010'; ticket = 'ABC-1' } $ut
Ok 'usuário comum lê o ajuste e registra o chamado' ($cs.Json.code -eq 0 -and $cn.Json.code -eq 0)
$null = Api 'POST' '/api/admin/user/delete' @{ id = $ul.id } $tok

# ===== revogar e limite =====
$rv = Api 'POST' '/api/admin/nextec/install-token/revoke' @{} $tok
$old = Api 'POST' '/api/nextec/install/assign' @{ id = '910000099'; group = $alfa; token = $tA } $null
$tA2 = (Api 'GET' "/api/admin/nextec/install-token?group_id=$alfa" $null $tok).Json.data.token
Ok 'invalidar derruba os comandos antigos e gera chave nova' ($rv.Json.code -eq 0 -and $old.Status -eq 401 -and $tA2 -ne $tA)
$last = 0; 1..12 | ForEach-Object { $last = (Api 'POST' '/api/nextec/install/assign' @{ id = '910000098'; group = $alfa; token = 'errada' } $null).Status }
Ok 'tentativas erradas em excesso são bloqueadas (429)' ($last -eq 429) "último status $last"

$res | Format-Table -AutoSize -Wrap | Out-String -Width 220
"Passaram: $(($res | Where-Object Passou).Count) de $($res.Count)"
