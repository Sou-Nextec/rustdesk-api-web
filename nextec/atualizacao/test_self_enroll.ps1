#requires -version 5.1
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'Provisionar-Agente-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Provisioner syntax invalid' }
foreach ($function in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  . ([scriptblock]::Create($function.Extent.Text))
}
$script:realSelfEnrollPost = (Get-Command Invoke-NextecSelfEnrollPost).ScriptBlock
$script:NextecPainelFixo = 'https://painel-remoto.nex.tec.br'
$script:NextecProvisionScriptRoot = $PSScriptRoot

function Assert($value, [string]$message) { if (-not $value) { throw $message } }
# Sem ACL, DPAPI nem disco protegido: os mesmos duples do test_coordinator.ps1.
function Initialize-NextecProvisionDirectory { param($Root) New-Item -ItemType Directory -Path $Root -Force | Out-Null }
function Assert-NextecProvisionPath { param($Path) }
function Assert-NextecProvisionFileAcl { param($Path) }
function Write-NextecProtectedJson { param($Path,$Value) $Value | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $Path -Encoding UTF8 }
function Protect-NextecProvisionValue { param($Value) return 'dpapi:' + $Value }
function Unprotect-NextecProvisionValue { param($Value) return $Value.Substring(6) }
function Write-NextecProvisionLog { param($Code,$Root) $script:logs.Add([string]$Code) | Out-Null }

$script:root = Join-Path ([IO.Path]::GetTempPath()) ('nextec-selfenroll-' + [Guid]::NewGuid().ToString('N'))
$script:logs = New-Object System.Collections.Generic.List[string]
$script:posts = New-Object System.Collections.Generic.List[object]
$script:registers = New-Object System.Collections.Generic.List[string]
$script:t0 = [DateTime]::SpecifyKind([DateTime]'2026-10-12T12:00:00', [DateTimeKind]::Utc)
$script:key = 'ChaveGlobalDeTesteNaoSecreta0123456789'
$script:uuidB64 = 'MDAwMDAwMDAtMTExMS0yMjIyLTMzMzMtNDQ0NDQ0NDQ0NDQ0'
$script:proposed = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

function New-CaseRoot {
  if (Test-Path -LiteralPath $script:root) { Remove-Item -LiteralPath $script:root -Recurse -Force }
  New-Item -ItemType Directory -Path $script:root -Force | Out-Null
  $script:logs.Clear(); $script:posts.Clear(); $script:registers.Clear()
}
function Add-Enrollment {
  param([string]$Key = $script:key)
  $paths = Get-NextecProvisionPaths -Root $script:root
  @{ v = 1; painel = $script:NextecPainelFixo; chave = $Key } | ConvertTo-Json -Compress | Set-Content -LiteralPath $paths.Enroll -Encoding UTF8
}
function Invoke-Case {
  param([int[]]$Statuses = @(200), [DateTime]$Now = $script:t0, [string]$Id = '536822159', [string]$ResponseState = 'pending')
  $script:statusQueue = New-Object System.Collections.Generic.Queue[int]
  foreach ($s in $Statuses) { $script:statusQueue.Enqueue($s) }
  $script:responseState = $ResponseState
  $post = {
    param($panel, $body)
    $script:posts.Add([pscustomobject]@{ panel = $panel; body = $body }) | Out-Null
    $status = if ($script:statusQueue.Count) { $script:statusQueue.Dequeue() } else { 200 }
    [pscustomobject]@{ status = $status; token = $body.proposed_token; state = $script:responseState }
  }
  Invoke-NextecProvisioning -Root $script:root -DiscoverId ([scriptblock]::Create("'" + $Id + "'")) -Now $Now `
    -NewToken { $script:proposed } -PostSelfEnroll $post -GetUuid { $script:uuidB64 } `
    -PostBootstrap { param($p,$b) throw 'legacy bootstrap must not be used' } `
    -RegisterAgent { param($path) $script:registers.Add($path) | Out-Null }
}

try {
  # uuid = base64 padrao do MachineGuid sem espacos (formato que o RustDesk 1.5.0 envia em heartbeat/sysinfo).
  $derived = Get-NextecMachineUuid -GuidReader { '  00000000-1111-2222-3333-444444444444 ' }
  Assert ($derived -ceq $script:uuidB64 -and $derived.EndsWith('NDQ0')) 'UUID derivation is not standard base64 of the trimmed MachineGuid'
  $live = (Get-ItemProperty -Path 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography').MachineGuid
  $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((Get-NextecMachineUuid)))
  Assert ($decoded -ceq $live.Trim()) 'Live UUID does not decode to the registry MachineGuid'
  Write-Host 'PASS Uuid_IsBase64OfMachineGuid'

  # Inscricao ok: sem bootstrap.json e sem agente-senha.json.
  New-CaseRoot; Add-Enrollment
  $result = Invoke-Case -ResponseState 'pending'
  $paths = Get-NextecProvisionPaths -Root $script:root
  Assert ($result -eq 'complete') "Self enrollment did not complete: $result; logs=$($script:logs -join ',')"
  Assert ($script:posts.Count -eq 1) 'Self-enroll API not called once'
  $body = $script:posts[0].body
  Assert ($body.enroll_key -ceq $script:key -and $body.id -eq '536822159' -and $body.uuid -ceq $script:uuidB64 -and $body.proposed_token -ceq $script:proposed) 'Self-enroll payload wrong'
  $cfg = Read-NextecAgentTokenConfig -Path $paths.AgentConfig
  Assert ($cfg.token -ceq $script:proposed -and $cfg.id -eq '536822159') 'Token was not saved in the agent config'
  Assert ($script:registers.Count -eq 1) 'SYSTEM task registration not requested once'
  $state = Read-NextecSelfState -Path $paths.SelfState
  Assert ($state.state -eq 'self' -and -not $state.proposed_token) 'Self journal state wrong after enrollment'
  Assert (-not ($script:logs -join ' ').Contains($script:key) -and -not ($script:logs -join ' ').Contains($script:proposed)) 'Secret in log'
  Write-Host 'PASS SelfEnroll_PendingSavesTokenAndRegisters'

  New-CaseRoot; Add-Enrollment
  Assert ((Invoke-Case -ResponseState 'assigned') -eq 'complete') 'Assigned response not accepted'
  Write-Host 'PASS SelfEnroll_AssignedAccepted'

  # 404 e 429: tenta de novo com recuo, mantendo o mesmo token proposto e sem martelar.
  foreach ($status in @(404, 429)) {
    New-CaseRoot; Add-Enrollment
    $first = Invoke-Case -Statuses @($status)
    Assert ($first -eq 'network_retry' -and $script:posts.Count -eq 1) "HTTP $status was not a retry"
    $tooSoon = Invoke-Case -Statuses @(200) -Now $script:t0.AddMinutes(2)
    Assert ($tooSoon -eq 'self_backoff' -and $script:posts.Count -eq 1) "HTTP $status retried before the backoff"
    $second = Invoke-Case -Statuses @(404) -Now $script:t0.AddMinutes(5)
    Assert ($second -eq 'network_retry' -and $script:posts.Count -eq 2) 'Second attempt did not call the API after the first interval'
    $tooSoon = Invoke-Case -Statuses @(200) -Now $script:t0.AddMinutes(10)
    Assert ($tooSoon -eq 'self_backoff') 'Backoff did not grow'
    $third = Invoke-Case -Statuses @(200) -Now $script:t0.AddMinutes(16)
    Assert ($third -eq 'complete' -and $script:posts.Count -eq 3) "HTTP $status did not recover"
    Assert ($script:posts[0].body.proposed_token -ceq $script:posts[2].body.proposed_token) 'Retry changed the proposed token'
    Assert (-not (Test-Path (Get-NextecProvisionPaths -Root $script:root).Journal)) 'Self enrollment created a bootstrap journal'
  }
  Write-Host 'PASS SelfEnroll_404And429RetryWithBackoff'

  # 401 e 409: autorizacao manual; nao insiste, a chave nova reabilita.
  foreach ($status in @(401, 409)) {
    New-CaseRoot; Add-Enrollment
    $result = Invoke-Case -Statuses @($status)
    Assert ($result -eq 'manual_authorization_required') "HTTP $status was not manual"
    Assert (-not (Test-Path (Get-NextecProvisionPaths -Root $script:root).AgentConfig)) 'Token saved after refusal'
    $again = Invoke-Case -Statuses @(200) -Now $script:t0.AddHours(3)
    Assert ($again -eq 'manual_authorization_required' -and $script:posts.Count -eq 1) "HTTP $status was retried automatically"
  }
  Add-Enrollment -Key 'OutraChaveGlobalDeTeste9876543210'
  Assert ((Invoke-Case -Statuses @(200) -Now $script:t0.AddHours(4)) -eq 'complete') 'A replaced enrollment key did not re-enable the attempt'
  Write-Host 'PASS SelfEnroll_401And409AreManual'

  # 403: parada de 24 horas.
  New-CaseRoot; Add-Enrollment
  Assert ((Invoke-Case -Statuses @(403)) -eq 'blocked') '403 did not block'
  Assert ((Invoke-Case -Statuses @(200) -Now $script:t0.AddHours(23)) -eq 'blocked' -and $script:posts.Count -eq 1) 'Blocked agent called the API before 24 hours'
  Assert ((Invoke-Case -Statuses @(200) -Now $script:t0.AddHours(25)) -eq 'complete' -and $script:posts.Count -eq 2) 'Agent did not resume after 24 hours'
  Write-Host 'PASS SelfEnroll_403StopsForTwentyFourHours'

  # Replay idempotente: erro de rede reenvia o mesmo par id/uuid/token; registro interrompido nao repete o POST.
  New-CaseRoot; Add-Enrollment
  Assert ((Invoke-Case -Statuses @(0)) -eq 'network_retry') 'Network failure was not a retry'
  Assert ((Invoke-Case -Statuses @(200) -Now $script:t0.AddMinutes(6)) -eq 'complete') 'Replay did not complete'
  Assert ($script:posts.Count -eq 2 -and $script:posts[0].body.proposed_token -ceq $script:posts[1].body.proposed_token -and $script:posts[0].body.uuid -ceq $script:posts[1].body.uuid) 'Replay changed identity or token'
  New-CaseRoot; Add-Enrollment
  $registerFails = $true
  $post = { param($panel,$body) $script:posts.Add([pscustomobject]@{panel=$panel;body=$body}) | Out-Null; [pscustomobject]@{status=200;token=$body.proposed_token;state='pending'} }
  $r1 = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:t0 -NewToken { $script:proposed } -PostSelfEnroll $post -GetUuid { $script:uuidB64 } -RegisterAgent { param($p) throw 'task registration unavailable' }
  $r2 = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:t0.AddMinutes(5) -NewToken { throw 'must not mint another token' } -PostSelfEnroll { throw 'must not post again' } -GetUuid { throw 'unused' } -RegisterAgent { param($p) $script:registers.Add($p) | Out-Null }
  Assert ($r1 -eq 'registration_retry' -and $r2 -eq 'already_configured' -and $script:posts.Count -eq 1 -and $script:registers.Count -eq 1) 'Interrupted registration was not resumed without a second enrollment'
  $paths = Get-NextecProvisionPaths -Root $script:root
  Assert (-not (Read-NextecSelfState -Path $paths.SelfState).proposed_token) 'Proposed token kept after completed recovery'
  Write-Host 'PASS SelfEnroll_ReplayIsIdempotent'

  # Identidade divergente nunca chega a rede; agente ja configurado nao reinscreve.
  New-CaseRoot; Add-Enrollment
  $rejected = $false
  try { Invoke-Case -Id 'abc' } catch { $rejected = ($_.Exception.Message -eq 'identity_conflict') }
  Assert ($rejected -and $script:posts.Count -eq 0) 'Invalid local ID reached the API'
  New-CaseRoot; Add-Enrollment
  Save-NextecAgentTokenConfig -Path (Get-NextecProvisionPaths -Root $script:root).AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'existing-token'
  Assert ((Invoke-Case) -eq 'already_configured' -and $script:posts.Count -eq 0) 'Configured agent enrolled again'
  Write-Host 'PASS SelfEnroll_NeverDuplicatesIdentity'

  # Bootstrap antigo intacto: com bootstrap.json o fluxo de 15 minutos roda e a inscricao nao e usada.
  New-CaseRoot; Add-Enrollment
  $paths = Get-NextecProvisionPaths -Root $script:root
  @{ painel=$script:NextecPainelFixo; id='536822159'; uuid='device-uuid-1'; bootstrap='Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } | ConvertTo-Json -Compress | Set-Content -LiteralPath $paths.Input -Encoding UTF8
  $legacy = New-Object System.Collections.Generic.List[object]
  $result = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:t0 -NewToken { $script:proposed } `
    -PostBootstrap { param($p,$b) $legacy.Add($b) | Out-Null; [pscustomobject]@{ token = $b.proposed_token } } `
    -PostSelfEnroll { throw 'self enrollment must not run with bootstrap.json' } -GetUuid { throw 'unused' } `
    -RegisterAgent { param($p) $script:registers.Add($p) | Out-Null }
  Assert ($result -eq 'complete' -and $legacy.Count -eq 1 -and $legacy[0].uuid -eq 'device-uuid-1' -and $legacy[0].bootstrap -ceq 'Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') 'Legacy bootstrap flow changed'
  Assert (-not (Test-Path $paths.SelfState)) 'Legacy flow touched the self enrollment journal'
  # Sem bootstrap e sem inscricao.json: comportamento anterior (autorizacao manual).
  New-CaseRoot
  Assert ((Invoke-Case) -eq 'manual_authorization_required' -and $script:posts.Count -eq 0) 'Missing enrollment file changed the legacy outcome'
  Write-Host 'PASS Bootstrap_LegacyFlowUntouched'

  # Entrada estrita do inscricao.json.
  foreach ($bad in @('{"v":2,"painel":"https://painel-remoto.nex.tec.br","chave":"0123456789abcdef0123"}',
                     '{"v":1,"painel":"https://outro.invalid","chave":"0123456789abcdef0123"}',
                     '{"v":1,"painel":"https://painel-remoto.nex.tec.br","chave":"0123456789abcdef0123","x":1}',
                     '{"v":1,"painel":"https://painel-remoto.nex.tec.br","chave":"curta"}')) {
    $rejected = $false
    try { ConvertFrom-NextecStrictEnrollmentJson -Json $bad | Out-Null } catch { $rejected = $true }
    Assert $rejected "Enrollment file accepted: $bad"
  }
  Write-Host 'PASS Enrollment_StrictParser'

  # HTTP real contra um servidor falso local (HttpListener em runspace separado).
  $port = Get-Random -Minimum 20000 -Maximum 40000
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://127.0.0.1:$port/")
  $listener.Start()
  $script:seen = [hashtable]::Synchronized(@{ bodies = (New-Object System.Collections.ArrayList); agents = (New-Object System.Collections.ArrayList) })
  $ps = [PowerShell]::Create()
  [void]$ps.AddScript({
    param($listener, $seen)
    while ($listener.IsListening) {
      try { $ctx = $listener.GetContext() } catch { break }
      $reader = New-Object IO.StreamReader($ctx.Request.InputStream)
      $json = $reader.ReadToEnd()
      $data = $json | ConvertFrom-Json
      [void]$seen.bodies.Add($json); [void]$seen.agents.Add($ctx.Request.UserAgent)
      $status = 200; $payload = @{ token = $data.proposed_token; state = 'pending' }
      switch -Regex ($data.id) {
        '^404' { $status = 404; $payload = @{ error = 'peer_not_registered' } }
        '^429' { $status = 429; $payload = @{ error = 'pending_limit' } }
        '^403' { $status = 403; $payload = @{ error = 'blocked' } }
        '^401' { $status = 401; $payload = @{ error = 'enroll_key_invalid' } }
        '^409' { $status = 409; $payload = @{ error = 'already_enrolled' } }
      }
      $bytes = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress))
      $ctx.Response.StatusCode = $status
      $ctx.Response.ContentType = 'application/json'
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.Close()
    }
  }).AddArgument($listener).AddArgument($script:seen)
  $handle = $ps.BeginInvoke()
  try {
    $origin = "http://127.0.0.1:$port"
    foreach ($case in @(@('536822159',200),@('404000111',404),@('429000111',429),@('403000111',403),@('401000111',401),@('409000111',409))) {
      $r = & $script:realSelfEnrollPost -Panel $script:NextecPainelFixo -Body @{ enroll_key=$script:key; id=$case[0]; uuid=$script:uuidB64; proposed_token=$script:proposed } -TestOrigin $origin
      Assert ($r.status -eq $case[1]) "Fake server $($case[0]) returned $($r.status), expected $($case[1])"
      if ($case[1] -eq 200) { Assert ($r.token -ceq $script:proposed -and $r.state -eq 'pending') 'Fake server 200 body not parsed' }
    }
    Assert ($script:seen.agents[0] -eq 'Nextec-Connect-Agent/1') 'Client identity header missing'
    $sent = $script:seen.bodies[0] | ConvertFrom-Json
    Assert (@($sent.PSObject.Properties.Name | Sort-Object) -join ',' -eq 'enroll_key,id,proposed_token,uuid') 'Request body fields differ from the contract'
    $blocked = $false
    try { & $script:realSelfEnrollPost -Panel $script:NextecPainelFixo -Body @{} -TestOrigin 'http://10.0.0.5:80' | Out-Null } catch { $blocked = $true }
    Assert $blocked 'Test origin accepted a non loopback address'
    Write-Host 'PASS Http_FakeServerStatusMapping'
  } finally {
    $listener.Stop(); $listener.Close()
    try { $ps.EndInvoke($handle) } catch {}
    $ps.Dispose()
  }
} finally {
  if (Test-Path -LiteralPath $script:root) { Remove-Item -LiteralPath $script:root -Recurse -Force }
}
Write-Host 'Todos os testes de inscricao global (Windows) passaram.'
