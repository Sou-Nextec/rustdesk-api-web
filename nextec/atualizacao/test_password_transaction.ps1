#requires -version 5.1
$ErrorActionPreference = 'Stop'
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1'), [ref]$null, [ref]$null)
foreach ($f in $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]}, $true)) {
  . ([scriptblock]::Create($f.Extent.Text))
}
function Assert($value, $message) { if (-not $value) { throw $message } }
function Escrever($message) { Assert ($message -notmatch 'secret|password-candidate') 'Secret in log' }
function Proteger($value) { return 'protected:' + $value }
function Revelar($value) { return $value.Substring('protected:'.Length) }
function Save-NextecAgentState($State) { $script:saves++; $script:saved = $State | ConvertTo-Json -Compress }
function SenhaForte { $script:generated++; return 'password-candidate' }
function Opcao($name, $value) { $script:options++ }
function InvocarRustDesk($Argumentos) {
  $script:applied++
  return [pscustomobject]@{ExitCode=0;Output=$script:cliOutput}
}
function Chamar($path, $body) {
  $script:calls.Add([pscustomobject]@{path=$path;body=$body}) | Out-Null
  if ($path -eq '/api/nextec/agent/sync') { return $script:response }
  if ($path -eq '/api/nextec/agent/password') { return [pscustomobject]@{ok=$true;operation_id=$script:proposalOperation;pending_version=2} }
  if ($path -eq '/api/nextec/agent/confirm') {
    if ($script:confirmFails) { throw 'confirmation unavailable' }
    return [pscustomobject]@{ok=$true;active_version=$script:confirmedVersion}
  }
  throw 'Unexpected route'
}
function Reset-Case {
  $script:proposalOperation='op-1'
  $script:generated=0; $script:applied=0; $script:saves=0; $script:options=0
  $script:cliOutput='Done!'; $script:confirmFails=$false; $script:confirmedVersion=2
  $script:calls=New-Object System.Collections.Generic.List[object]
  $script:response=[pscustomobject]@{
    managed=$true;rotate=$true;transaction_v1=$true;recovery=$false
    approve_mode='password';verification_method='use-permanent-password'
    operation=[pscustomobject]@{operation_id='op-1';pending_version=2;pending_password=''}
  }
  $script:cfg=[pscustomobject]@{id='536822159';token='protected:token';painel='https://example.invalid'}
  $script:Simular=$false; $script:Exe='client.exe'
}

Reset-Case
Invoke-NextecPasswordCycle $cfg
Assert ($calls[0].body.capabilities -contains 'transaction_v1') 'Capability not negotiated'
Assert ($applied -eq 1 -and $generated -eq 1) 'New operation not applied once'
Assert ($calls[-1].body.operation_id -eq 'op-1' -and $calls[-1].body.pending_version -eq 2) 'Confirmation does not identify operation'
Assert (-not $cfg.applied_operation_id) 'Confirmed journal not cleared'
Write-Host 'PASS Transaction_NewOperation'

Reset-Case
$confirmFails=$true
try { Invoke-NextecPasswordCycle $cfg; throw 'Expected confirmation failure' } catch { Assert ($_.Exception.Message -eq 'confirmation unavailable') 'Unexpected failure' }
Assert ($cfg.applied_operation_id -eq 'op-1' -and $cfg.applied_pending_version -eq 2) 'Applied journal lost after network failure'
Assert ($cfg.pending_password -eq 'protected:password-candidate') 'Candidate not protected'
$confirmFails=$false
$response.operation.pending_password='password-candidate'
$response.recovery=$true
Invoke-NextecPasswordCycle $cfg
Assert ($generated -eq 1) 'Recovery generated another password'
Assert (@($calls | Where-Object path -eq '/api/nextec/agent/password').Count -eq 1) 'Recovery overwrote pending password'
Write-Host 'PASS Transaction_ConfirmTimeoutRecovery'

Reset-Case
$cliOutput='Settings are disabled!'
try { Invoke-NextecPasswordCycle $cfg; throw 'Expected apply rejection' } catch { Assert ($_.Exception.Message -match 'password_apply_failed') 'Unexpected apply error' }
Assert (@($calls | Where-Object path -eq '/api/nextec/agent/confirm').Count -eq 0) 'Rejected CLI confirmed remotely'
Assert (-not $cfg.applied_operation_id) 'Rejected CLI marked applied'
Write-Host 'PASS Transaction_ApplyFailure'

Reset-Case
$confirmedVersion=3
try { Invoke-NextecPasswordCycle $cfg; throw 'Expected confirmation version rejection' } catch { Assert ($_.Exception.Message -match 'confirmation_failed') 'Unexpected confirmation version error' }
Assert ($cfg.applied_operation_id -eq 'op-1') 'Unexpected confirmation version cleared journal'
Write-Host 'PASS Transaction_RejectsUnexpectedConfirmedVersion'

Reset-Case
$response.managed=$false; $response.rotate=$false; $response.recovery=$true
$response.operation.pending_password='server-secret'
Invoke-NextecPasswordCycle $cfg
Assert ($applied -eq 0 -and $options -eq 0 -and $calls.Count -eq 1) 'Disabled policy applied a password'
Write-Host 'PASS Transaction_DisabledPolicyNeverApplies'

Reset-Case
$response.managed=$false; $response.rotate=$false; $response.recovery=$true
$cfg | Add-Member applied_operation_id 'op-1'
$cfg | Add-Member applied_pending_version 2
Invoke-NextecPasswordCycle $cfg
Assert ($applied -eq 0 -and $calls[-1].path -eq '/api/nextec/agent/confirm') 'Disabled policy did not reconcile previously applied operation'
Write-Host 'PASS Transaction_DisabledPolicyReconcilesJournal'

Reset-Case
$response.transaction_v1=$false
$cfg | Add-Member protocol_version 1
try { Invoke-NextecPasswordCycle $cfg; throw 'Expected downgrade rejection' } catch { Assert ($_.Exception.Message -match 'protocol_downgrade') 'Unexpected downgrade error' }
Assert ($applied -eq 0 -and $calls.Count -eq 1) 'Negotiated agent downgraded'
Write-Host 'PASS Transaction_NoDowngrade'

Reset-Case
$response.transaction_v1=$false
Invoke-NextecPasswordCycle $cfg
Assert ($calls[-1].path -eq '/api/nextec/agent/confirm' -and -not $calls[-1].body.operation_id) 'Legacy API compatibility broken'
Write-Host 'PASS Transaction_LegacyCompatibility'

Reset-Case
$proposalOperation='op-other'
try { Invoke-NextecPasswordCycle $cfg; throw 'Expected proposal rejection' } catch { Assert ($_.Exception.Message -match 'proposal_failed') 'Unexpected proposal error' }
Assert ($applied -eq 0) 'Mismatched proposal applied locally'
Write-Host 'PASS Transaction_RejectsUnexpectedProposal'

Reset-Case
$response.operation=$null; $response.rotate=$false; $response.managed=$false
$cfg | Add-Member pending_password 'protected:old-secret'
$cfg | Add-Member applied_operation_id 'confirmed-op'
Invoke-NextecPasswordCycle $cfg
Assert (-not $cfg.pending_password -and -not $cfg.applied_operation_id -and $applied -eq 0) 'Completed operation retained local secret'
Write-Host 'PASS Transaction_ClearsCompletedJournal'

Reset-Case
$response = [pscustomobject]@{ managed=$false; rotate=$false; transaction_v1=$false; pending_approval=$true; approve_mode=''; verification_method='' }
Invoke-NextecPasswordCycle $cfg
Assert ($applied -eq 0 -and $generated -eq 0 -and $options -eq 0) 'Pending approval applied or generated a password'
Assert ($calls.Count -eq 1 -and $calls[0].path -eq '/api/nextec/agent/sync') 'Pending approval contacted routes other than sync'
Assert ($cfg.enrollment_state -eq 'pending_approval') 'Pending approval was not recorded in the agent state'
$savesAfterFirst = $saves
Invoke-NextecPasswordCycle $cfg
Assert ($saves -eq $savesAfterFirst -and $applied -eq 0) 'Pending approval rewrote state on every cycle'
Write-Host 'PASS Transaction_PendingApprovalWaitsWithoutRotation'

Reset-Case
$cfg | Add-Member enrollment_state 'pending_approval'
Invoke-NextecPasswordCycle $cfg
Assert (-not $cfg.enrollment_state -and $applied -eq 1) 'Assignment did not clear the pending state and resume rotation'
Write-Host 'PASS Transaction_AssignmentResumesNormalCycle'
