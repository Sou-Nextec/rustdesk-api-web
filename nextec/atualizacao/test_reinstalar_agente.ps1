#requires -version 5.1
<#
Integracao da reinstalacao (Reinstalar agente / Ativar-Nextec-<ID>.cmd com -SubstituirAgenteAntigo): o provisionador REAL
(Provisionar-Agente-Nextec.ps1) sonda o token antigo num servidor HTTP falso local (HttpListener em 127.0.0.1).
Confirma, com respostas HTTP de verdade:
  - a sondagem vai com probe:true (o painel nao conta como consulta nem grava last_sync_at);
  - credencial valida + tarefa ausente: repara com a credencial existente, sem bootstrap e sem recusar;
  - credencial recusada (401): bootstrap de substituicao; a credencial antiga so sai depois de o painel aceitar a nova;
  - bootstrap recusado (409): a credencial antiga continua no lugar.

Sem administrador, ACLs e log protegido do provisionador sao substituidos por duplas simples; o restante e o codigo real.
#>
[CmdletBinding()]
param([string]$InstallDir)
$ErrorActionPreference = 'Stop'
if (-not $InstallDir) { $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
function Assert($value, [string]$message) { if (-not $value) { throw "ASSERT: $message" } }

Add-Type -AssemblyName System.Security
$path = Join-Path $InstallDir 'Provisionar-Agente-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw "Provisionar-Agente-Nextec.ps1 nao compilou: $($errors[0].Message)" }
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  . ([scriptblock]::Create($definition.Extent.Text))
}

# servidor falso: /agent/sync responde pelo token ($state.Tokens: token -> agent_state; ausente = 401);
# /agent/bootstrap responde $state.BootstrapStatus e, com 200, aposenta o token antigo e devolve o proposto.
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0); $probe.Start()
$port = ([Net.IPEndPoint]$probe.LocalEndpoint).Port; $probe.Stop()
$script:testOrigin = "http://127.0.0.1:$port"
$state = [hashtable]::Synchronized(@{ Tokens = [hashtable]::Synchronized(@{}); BootstrapStatus = 200; Requests = New-Object System.Collections.ArrayList })
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("$($script:testOrigin)/")
$listener.Start()
$runspace = [runspacefactory]::CreateRunspace(); $runspace.Open()
$runspace.SessionStateProxy.SetVariable('listener', $listener)
$runspace.SessionStateProxy.SetVariable('state', $state)
$pipe = [powershell]::Create(); $pipe.Runspace = $runspace
$null = $pipe.AddScript({
  while ($listener.IsListening) {
    try { $ctx = $listener.GetContext() } catch { break }
    try {
      $raw = (New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
      $body = $null
      try { $body = $raw | ConvertFrom-Json } catch {}
      $p = $ctx.Request.Url.AbsolutePath
      [void]$state.Requests.Add([pscustomobject]@{ Path = $p; Probe = [bool]($body -and $body.probe) })
      if ($p -eq '/api/nextec/agent/sync') {
        $t = [string]$body.token
        if ($state.Tokens.ContainsKey($t)) { $status = 200; $payload = (@{ probe = [bool]$body.probe; agent_state = $state.Tokens[$t] } | ConvertTo-Json -Compress) }
        else { $status = 401; $payload = '{"error":"unauthorized"}' }
      } elseif ($p -eq '/api/nextec/agent/bootstrap') {
        $status = [int]$state.BootstrapStatus
        if ($status -eq 200) {
          $state.Tokens.Clear()
          $state.Tokens[[string]$body.proposed_token] = 'parado'
          $payload = (@{ token = [string]$body.proposed_token } | ConvertTo-Json -Compress)
        } else { $payload = '{"error":"already enrolled"}' }
      } else { $status = 404; $payload = '{"error":"not_found"}' }
      $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
      $ctx.Response.StatusCode = $status
      $ctx.Response.ContentType = 'application/json'
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {} finally { try { $ctx.Response.Close() } catch {} }
  }
})
$handle = $pipe.BeginInvoke()

$work = Join-Path ([IO.Path]::GetTempPath()) ('nextec-reinstalar-' + [Guid]::NewGuid().ToString('N'))
try {
  # O provisionador enxerga o painel falso (http loopback) so neste teste; o resto do codigo e o real.
  $realConvert = (Get-Command ConvertTo-NextecPainelUrl).ScriptBlock
  function ConvertTo-NextecPainelUrl { param([string]$Url) if ($Url -ceq $script:testOrigin) { return $Url }; return (& $script:realConvert -Url $Url) }
  function Initialize-NextecProvisionDirectory { param($Root) New-Item -ItemType Directory -Path $Root -Force | Out-Null }
  function Assert-NextecProvisionPath { param($Path) }
  function Assert-NextecProvisionFileAcl { param($Path) }
  # O log e o REAL (Write-NextecProvisionLog): lista de codigos e gravacao em arquivo entram no teste.
  function Write-NextecProtectedJson { param($Path, $Value) $Value | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $Path -Encoding UTF8 }
  function Set-Acl { param($LiteralPath, $AclObject) }
  $script:NextecPainelFixo = $script:testOrigin

  $id = '536822159'
  $oldToken = 'Old0123456789AbCdEf0123456789AbCdEf0123456'
  $json = @{ painel = $script:testOrigin; id = $id; uuid = 'device-uuid-1'; bootstrap = ('B' * 43) } | ConvertTo-Json -Compress
  $script:registered = New-Object System.Collections.Generic.List[string]
  $register = { param($p) $script:registered.Add($p) | Out-Null }
  # bootstrap real pelo HTTP do teste (Invoke-NextecBootstrapPost exige HTTPS; aqui a mesma chamada vai ao loopback)
  $postBootstrap = { param($panel, $body) Invoke-RestMethod -Uri ($panel + '/api/nextec/agent/bootstrap') -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 10 -MaximumRedirection 0 }
  function New-Case {
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $state.Requests.Clear(); $state.Tokens.Clear(); $state.BootstrapStatus = 200; $script:registered.Clear()
    $paths = Get-NextecProvisionPaths -Root $work
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:testOrigin -Id $id -Token $oldToken
    return $paths
  }
  function Get-Logs { $l = (Get-NextecProvisionPaths -Root $work).Log; if (Test-Path -LiteralPath $l) { return @(Get-Content -LiteralPath $l | ForEach-Object { ([string]$_) -replace '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ', '' }) }; return @() }

  # 1) credencial valida (painel diz parado porque a tarefa sumiu) e tarefa ausente: repara, sem bootstrap
  $paths = New-Case
  $state.Tokens[$oldToken] = 'parado'
  $out = Receive-NextecBootstrapAuthorization -Root $work -ReadInput { $json } -DiscoverId { $id } -SubstituirAgenteAntigo -AgentTaskReady { param($r) $false } -RegisterAgent $register
  Assert ([string]$out -match 'reparado') "reparo nao informado: $out"
  Assert ($script:registered.Count -eq 1) 'tarefa nao foi registrada de novo'
  Assert (-not (Test-Path -LiteralPath $paths.Input)) 'reparo gravou autorizacao de bootstrap'
  Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -ceq $oldToken) 'reparo trocou a credencial'
  $syncs = @($state.Requests | Where-Object { $_.Path -eq '/api/nextec/agent/sync' })
  Assert ($syncs.Count -eq 1 -and $syncs[0].Probe) 'a sondagem nao foi uma unica chamada com probe:true'
  Assert (@($state.Requests | Where-Object { $_.Path -eq '/api/nextec/agent/bootstrap' }).Count -eq 0) 'reparo chamou o bootstrap'
  Assert ((Get-Logs) -contains 'agent_repaired') 'reparo nao registrado no log'
  Assert (@(Get-Logs | Where-Object { $_ -like 'unknown_code*' -or $_ -eq 'protocol_error' }).Count -eq 0) 'reparo gerou protocol_error/unknown_code no log real'
  Write-Host 'PASS Reinstall_ValidCredentialMissingTask_RepairsWithoutBootstrap'

  # 2) credencial recusada (401): bootstrap substitui; a antiga fica no lugar ate o painel aceitar a nova
  $paths = New-Case
  Receive-NextecBootstrapAuthorization -Root $work -ReadInput { $json } -DiscoverId { $id } -SubstituirAgenteAntigo -AgentTaskReady { param($r) $true } -RegisterAgent $register | Out-Null
  Assert (Test-Path -LiteralPath $paths.Input -PathType Leaf) 'autorizacao nao gravada para credencial 401'
  Assert ((Get-Logs) -contains 'old_agent_replace_token_recusado') 'substituicao nao gravou old_agent_replace_token_recusado no log real'
  Assert (@(Get-Logs | Where-Object { $_ -eq 'protocol_error' -or $_ -like 'unknown_code*' }).Count -eq 0) 'substituicao virou protocol_error no log real (BUG 1)'
  Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -ceq $oldToken) 'credencial antiga saiu antes do token novo ser aceito'
  $result = Invoke-NextecProvisioning -Root $work -DiscoverId { $id } -PostBootstrap $postBootstrap -RegisterAgent $register
  Assert ($result -eq 'complete') "substituicao nao concluiu: $result"
  $fresh = Read-NextecAgentTokenConfig -Path $paths.AgentConfig
  Assert ($fresh.token -cne $oldToken -and $state.Tokens.ContainsKey($fresh.token)) 'credencial nova nao e a aceita pelo painel'
  Assert ((Read-NextecAgentTokenConfig -Path ($paths.AgentConfig + '.anterior')).token -ceq $oldToken) 'credencial antiga nao ficou em .anterior'
  Assert (@($state.Requests | Where-Object { $_.Path -eq '/api/nextec/agent/sync' -and -not $_.Probe }).Count -eq 0) 'sondagem contou como sync real'
  Write-Host 'PASS Reinstall_RefusedCredential_BootstrapReplacesAfterAcceptance'

  # 3) bootstrap recusado (409, agente ainda ativo no painel): a credencial antiga continua valendo
  $paths = New-Case
  Receive-NextecBootstrapAuthorization -Root $work -ReadInput { $json } -DiscoverId { $id } -SubstituirAgenteAntigo -AgentTaskReady { param($r) $true } -RegisterAgent $register | Out-Null
  $state.BootstrapStatus = 409
  $rejected = $false
  try { Invoke-NextecProvisioning -Root $work -DiscoverId { $id } -PostBootstrap $postBootstrap -RegisterAgent $register | Out-Null } catch { $rejected = ($_.Exception.Message -eq 'already_enrolled') }
  Assert $rejected 'recusa 409 nao foi informada como already_enrolled'
  Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -ceq $oldToken) 'recusa do bootstrap perdeu a credencial antiga'
  Assert (-not (Test-Path -LiteralPath ($paths.AgentConfig + '.anterior'))) 'recusa do bootstrap moveu a credencial'
  Write-Host 'PASS Reinstall_BootstrapRefused_KeepsOldCredential'

  # 4) credencial valida, instalacao boa e agente ativo: mantido (already_enrolled), nada muda
  $paths = New-Case
  $state.Tokens[$oldToken] = 'ativo'
  Set-Content -LiteralPath $paths.AgentScript -Value '# agente' -Encoding ASCII
  $rejected = $false
  try { Receive-NextecBootstrapAuthorization -Root $work -ReadInput { $json } -DiscoverId { $id } -SubstituirAgenteAntigo -AgentTaskReady { param($r) $true } -RegisterAgent $register | Out-Null } catch { $rejected = ($_.Exception.Message -eq 'already_enrolled') }
  Assert ($rejected -and -not (Test-Path -LiteralPath $paths.Input) -and $script:registered.Count -eq 0) 'agente ativo e saudavel nao foi mantido'
  Write-Host 'PASS Reinstall_ActiveHealthyAgent_IsKept'
} finally {
  $listener.Stop(); $listener.Close()
  try { $pipe.EndInvoke($handle) } catch {}
  $pipe.Dispose(); $runspace.Close()
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
