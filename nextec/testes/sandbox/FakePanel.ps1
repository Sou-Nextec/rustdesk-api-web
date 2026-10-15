#requires -version 5.1
<#
Painel FALSO, so para o Windows Sandbox descartavel (rede desligada). Fala o protocolo do agente em HTTPS de verdade
(certificado autoassinado confiado pelo Run-InSandbox.ps1): bootstrap, sync, password e confirm. Nada de producao.
Estado em JSON (state_file) a cada chamada; o modo (mode_file) e relido a cada chamada para o teste forcar recusas.
A senha proposta fica so em segredo_file (pasta local do sandbox, nunca na pasta de saida) para o teste varrer vazamentos.
#>
param([Parameter(Mandatory)][string]$ConfigFile)
$ErrorActionPreference = 'Stop'
$cfg = [IO.File]::ReadAllText($ConfigFile) | ConvertFrom-Json
$st = @{
  started_at = [DateTime]::UtcNow.ToString('o')
  bootstrap_calls = 0; bootstrap_accepted = 0; bootstrap_refused = 0; bootstrap_id = ''; bootstrap_uuid = ''
  sync_count = 0; probe_count = 0; unauthorized_count = 0; last_sync_at = ''; last_error = ''; last_error_seen = 0
  app_name = ''; interval_seconds = 0; last_capabilities = ''
  password_proposals = 0; password_length = 0; confirm_count = 0; confirmed = $false
  operation_id = 'op-sbx-1'; calls = @()
}
$tokens = @{}
function Save-State {
  $json = $st | ConvertTo-Json -Depth 4 -Compress
  $tmp = $cfg.state_file + '.tmp'
  [IO.File]::WriteAllText($tmp, $json)
  Move-Item -LiteralPath $tmp -Destination $cfg.state_file -Force
}
function Get-Mode {
  try { return ([IO.File]::ReadAllText($cfg.mode_file) | ConvertFrom-Json) } catch { return [pscustomobject]@{ bootstrap = 'accept' } }
}
function Write-CallLog([string]$Text) {
  try { [IO.File]::AppendAllText($cfg.log_file, ('{0:HH:mm:ss} {1}' -f (Get-Date), $Text) + "`r`n") } catch { }
}
Save-State
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('https://' + $cfg.host + '/')
$listener.Start()
Write-CallLog ('painel falso ouvindo em https://' + $cfg.host + '/')
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $status = 404; $payload = @{ error = 'not_found' }; $note = ''
  $path = ''
  try {
    $path = $ctx.Request.Url.AbsolutePath
    $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
    $raw = $reader.ReadToEnd()
    $data = $null
    if ($raw) { $data = $raw | ConvertFrom-Json }
    $mode = Get-Mode
    switch ($path) {
      '/api/nextec/agent/bootstrap' {
        $st.bootstrap_calls++
        $okIdent = ($data.bootstrap -ceq $cfg.bootstrap -and [string]$data.id -ceq [string]$cfg.id -and [string]$data.uuid -ceq [string]$cfg.uuid -and [string]$data.proposed_token -cmatch '^[A-Za-z0-9_-]{43}$')
        if ($mode.bootstrap -eq '401') { $status = 401; $payload = @{ error = 'unauthorized' }; $st.bootstrap_refused++; $note = 'recusa simulada 401' }
        elseif ($mode.bootstrap -eq '409') { $status = 409; $payload = @{ error = 'already_enrolled' }; $st.bootstrap_refused++; $note = 'recusa simulada 409' }
        elseif (-not $okIdent) { $status = 401; $payload = @{ error = 'unauthorized' }; $st.bootstrap_refused++; $note = 'identidade ou autorizacao nao confere' }
        else {
          $tokens[[string]$data.id] = [string]$data.proposed_token
          $st.bootstrap_accepted++; $st.bootstrap_id = [string]$data.id; $st.bootstrap_uuid = [string]$data.uuid
          $status = 200; $payload = @{ token = [string]$data.proposed_token; state = 'assigned' }; $note = 'aceita'
        }
      }
      '/api/nextec/agent/sync' {
        $known = $tokens[[string]$data.id]
        if ($known -and [string]$data.token -ceq $known) {
          $status = 200
          if ($data.probe) {
            $st.probe_count++
            $payload = @{ agent_state = 'active' }; $note = 'probe'
          } else {
            $st.sync_count++
            $st.last_sync_at = [DateTime]::UtcNow.ToString('o')
            $st.interval_seconds = [int]$data.interval_seconds
            $st.app_name = [string]$data.app_name
            $st.last_capabilities = (@($data.capabilities) -join ',')
            if ($data.last_error) { $st.last_error = [string]$data.last_error; $st.last_error_seen++ } else { $st.last_error = '' }
            $payload = @{ managed = $true; transaction_v1 = $true; approve_mode = 'password'; verification_method = 'use-permanent-password'; interval = 60; rotate = $false }
            if (-not $st.confirmed) { $payload.rotate = $true; $payload.operation = @{ operation_id = 'op-sbx-1'; pending_version = 1 } }
            $note = 'sync last_error=' + [string]$data.last_error + ' app=' + [string]$data.app_name + ' interval=' + [string]$data.interval_seconds
          }
        } else { $status = 401; $payload = @{ error = 'unauthorized' }; $st.unauthorized_count++; $note = 'token desconhecido' }
      }
      '/api/nextec/agent/password' {
        $known = $tokens[[string]$data.id]
        if ($known -and [string]$data.token -ceq $known -and $data.operation_id -eq 'op-sbx-1') {
          $st.password_proposals++; $st.password_length = ([string]$data.password).Length
          [IO.File]::WriteAllText($cfg.secret_file, ([string]$data.password + "`r`n" + $known))
          $status = 200; $payload = @{ ok = $true; operation_id = 'op-sbx-1'; pending_version = 1 }; $note = 'proposta len=' + $st.password_length
        } else { $status = 401; $payload = @{ error = 'unauthorized' }; $st.unauthorized_count++ }
      }
      '/api/nextec/agent/confirm' {
        $known = $tokens[[string]$data.id]
        if ($known -and [string]$data.token -ceq $known -and $data.operation_id -eq 'op-sbx-1') {
          $st.confirm_count++; $st.confirmed = $true
          $status = 200; $payload = @{ ok = $true; active_version = 1 }; $note = 'confirmada'
        } else { $status = 401; $payload = @{ error = 'unauthorized' }; $st.unauthorized_count++ }
      }
    }
  } catch { $status = 500; $payload = @{ error = 'internal' }; $note = 'excecao: ' + $_.Exception.Message }
  try {
    $st.calls = @($st.calls + ('{0} {1}' -f $path, $status)) | Select-Object -Last 60
  } catch { }
  Write-CallLog ('{0} -> {1} {2}' -f $path, $status, $note)
  $bytes = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress -Depth 5))
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = 'application/json'
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
  Save-State
}
