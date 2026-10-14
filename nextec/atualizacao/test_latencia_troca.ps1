#requires -version 5.1
# Latencia da senha automatica: intervalo unico lido pelos tres scripts, disparo imediato da tarefa de senha, trava de
# execucao unica e transacao propor + aplicar + confirmar concluida na MESMA execucao (com repeticao de falha transitoria).
# NEXTEC_SCRIPT_ROOT (opcional) aponta para outra pasta de scripts, para comparar com uma versao anterior.
$ErrorActionPreference = 'Stop'
$scripts = if ($env:NEXTEC_SCRIPT_ROOT) { $env:NEXTEC_SCRIPT_ROOT } else { $PSScriptRoot }
$agentPath = Join-Path $scripts 'Agente-Senha-Nextec.ps1'
$provisionerPath = Join-Path $scripts 'Provisionar-Agente-Nextec.ps1'
$coordinatorPath = Join-Path $scripts 'Coordenar-Agente-Nextec.ps1'

# Dot-source de um scriptblock roda no escopo de quem chama: as funcoes ficam disponiveis no script de teste.
$ImportAllFunctions = {
  param([string]$Path)
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw "syntax error in $Path" }
  foreach ($f in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
    . ([scriptblock]::Create($f.Extent.Text))
  }
}
function Assert($value, [string]$message) { if (-not $value) { throw $message } }

. $ImportAllFunctions $agentPath
. $ImportAllFunctions $provisionerPath
. $ImportAllFunctions $coordinatorPath
$script:Tarefa = 'Nextec Acesso - Senha'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('nextec-latencia-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$utf8Bom = [Text.UTF8Encoding]::new($true)

try {
  # ---------- 1. Intervalo unico ----------
  $source = (Get-Content -LiteralPath $agentPath -Raw -Encoding UTF8)
  $intervals = Get-NextecAgentIntervals
  $fromProvisioner = Get-NextecConfiguredAgentIntervals -AgentScript $agentPath
  Assert ($fromProvisioner.PasswordMinutes -eq $intervals.PasswordMinutes -and $fromProvisioner.CoordinatorMinutes -eq $intervals.CoordinatorMinutes) 'Provisionar nao leu o intervalo do agente'
  Assert ((Get-NextecCoordinatorMinutes -AgentScript $agentPath) -eq $intervals.CoordinatorMinutes) 'Coordenar nao leu o intervalo do agente'
  Assert ($intervals.PasswordMinutes -eq 1) 'o padrao da tarefa de senha deve ser 1 minuto'

  $changedPath = Join-Path $tempRoot 'Agente-Alterado.ps1'
  $changed = $source -replace 'PasswordMinutes\s+= \d+', 'PasswordMinutes    = 3' -replace 'CoordinatorMinutes\s+= \d+', 'CoordinatorMinutes = 7'
  Assert ($changed -ne $source) 'a troca do intervalo de teste nao alterou o arquivo'
  [IO.File]::WriteAllText($changedPath, $changed, $utf8Bom)
  $fromChanged = Get-NextecConfiguredAgentIntervals -AgentScript $changedPath
  Assert ($fromChanged.PasswordMinutes -eq 3 -and $fromChanged.CoordinatorMinutes -eq 7) 'Provisionar nao seguiu o valor alterado na fonte unica'
  Assert ((Get-NextecCoordinatorMinutes -AgentScript $changedPath) -eq 7) 'Coordenar nao seguiu o valor alterado na fonte unica'

  $invalidPath = Join-Path $tempRoot 'Agente-Invalido.ps1'
  [IO.File]::WriteAllText($invalidPath, ($source -replace 'PasswordMinutes\s+= \d+', 'PasswordMinutes    = 0'), $utf8Bom)
  Assert ((Get-NextecConfiguredAgentIntervals -AgentScript $invalidPath).PasswordMinutes -eq 5) 'valor invalido deve cair no legado de 5 minutos'
  $legacyPath = Join-Path $tempRoot 'Agente-Legado.ps1'
  [IO.File]::WriteAllText($legacyPath, "param()`nfunction Algo { 1 }`n", $utf8Bom)
  Assert ((Get-NextecConfiguredAgentIntervals -AgentScript $legacyPath).PasswordMinutes -eq 5) 'agente sem a funcao deve cair no legado de 5 minutos'
  Assert ((Get-NextecCoordinatorMinutes -AgentScript (Join-Path $tempRoot 'nao-existe.ps1')) -eq 5) 'agente ausente deve cair no legado de 5 minutos'
  foreach ($path in @($agentPath, $provisionerPath, $coordinatorPath)) {
    $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    Assert ($text -notmatch 'RepetitionInterval\s+\(New-TimeSpan\s+-Minutes\s+\d') "literal de intervalo espalhado em $(Split-Path -Leaf $path)"
    Assert ($text -notmatch 'FromMinutes\(\d+\)\)\s*\{\s*return \$false') "limite literal de repeticao em $(Split-Path -Leaf $path)"
  }
  Write-Host 'PASS Intervalo_FonteUnicaLidaPorAgenteProvisionarECoordenar'

  # A tarefa registrada usa o valor da fonte unica (aqui trocado para 3 minutos).
  $script:trigger = $null
  $script:PastaDados = 'C:\ProgramData\Nextec\Acesso'; $env:SystemRoot = 'C:\Windows'; $script:Exe = ''
  function Assert-NextecNoReparsePoints($Path) { }
  function Copy-Item { param($LiteralPath, $Destination, [switch]$Force) }
  function Set-Acl { param($LiteralPath, $AclObject) }
  function New-NextecSecureAcl { return 'ACL' }
  function New-ScheduledTaskAction { param($Execute, $Argument) [pscustomobject]@{ Execute = $Execute; Argument = $Argument } }
  function New-ScheduledTaskTrigger { param([switch]$Once, $At, $RepetitionInterval, $RepetitionDuration) $script:trigger = $RepetitionInterval; [pscustomobject]@{ Interval = $RepetitionInterval } }
  function New-ScheduledTaskSettingsSet { param([switch]$StartWhenAvailable, [switch]$AllowStartIfOnBatteries, [switch]$DontStopIfGoingOnBatteries, $ExecutionTimeLimit, $MultipleInstances) @{ } }
  function Register-ScheduledTask { param($TaskName, $Action, $Trigger, $Settings, $User, $RunLevel, [switch]$Force) }
  Register-NextecPasswordTask -Source 'C:\Program Files\Nextec-Connect\Agente-Senha-Nextec.ps1'
  Assert ($script:trigger.TotalMinutes -eq 1) 'a tarefa de senha nao foi registrada com 1 minuto'
  $changedFunction = ([Management.Automation.Language.Parser]::ParseFile($changedPath, [ref]$null, [ref]$null)).Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-NextecAgentIntervals' }, $true)
  . ([scriptblock]::Create($changedFunction.Extent.Text))
  Register-NextecPasswordTask -Source 'C:\Program Files\Nextec-Connect\Agente-Senha-Nextec.ps1'
  Assert ($script:trigger.TotalMinutes -eq 3) 'a tarefa de senha nao seguiu a fonte unica alterada'
  . $ImportAllFunctions $agentPath   # volta ao valor real
  Write-Host 'PASS Intervalo_TarefaDeSenhaSegueAConstante'

  # ---------- 2. Migracao: tarefa antiga de 5 minutos nao e aceita pelo validador ----------
  $root = Join-Path $tempRoot 'dados'
  New-Item -ItemType Directory -Path $root | Out-Null
  [IO.File]::WriteAllText((Join-Path $root 'Agente-Senha-Nextec.ps1'), $source, $utf8Bom)
  $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  function New-ShapeTask($interval) {
    [pscustomobject]@{
      State = 'Ready'
      Principal = [pscustomobject]@{ UserId = 'SYSTEM'; RunLevel = 'Highest' }
      Actions = @([pscustomobject]@{ Execute = $psExe; Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $root 'Agente-Senha-Nextec.ps1') + '" -Executar') })
      Triggers = @([pscustomobject]@{ Repetition = [pscustomobject]@{ Interval = $interval } })
    }
  }
  Assert (Test-NextecAgentTaskShape -Task (New-ShapeTask 'PT1M') -Root $root) 'tarefa de 1 minuto deve valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-ShapeTask 'PT5M') -Root $root)) 'tarefa antiga de 5 minutos deve ser re-registrada'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-ShapeTask 'PT2M') -Root $root)) 'acima do intervalo unico nao pode valer'
  [IO.File]::WriteAllText((Join-Path $root 'Agente-Senha-Nextec.ps1'), $changed, $utf8Bom)
  Assert (Test-NextecAgentTaskShape -Task (New-ShapeTask 'PT3M') -Root $root) 'o validador deve aceitar ate o valor da fonte unica (3)'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-ShapeTask 'PT4M') -Root $root)) 'o validador nao pode aceitar acima da fonte unica (3)'
  Remove-Item -LiteralPath (Join-Path $root 'Agente-Senha-Nextec.ps1') -Force
  Assert (Test-NextecAgentTaskShape -Task (New-ShapeTask 'PT5M') -Root $root) 'sem script do agente vale o legado de 5 minutos (nada de re-registro em loop)'
  Write-Host 'PASS Migracao_TarefaDe5MinutosEhRegistradaDeNovo'

  # ---------- 3. Disparo imediato ----------
  . $ImportAllFunctions $agentPath
  $script:events = New-Object System.Collections.Generic.List[string]
  $script:taskState = 'Ready'; $script:startFails = $false
  function Escrever([string]$msg) { $script:events.Add('log') | Out-Null }
  function Register-NextecPasswordTask { param([string]$Source) $script:events.Add('register') | Out-Null }
  function Get-ScheduledTask { param($TaskName, $ErrorAction) [pscustomobject]@{ State = $script:taskState } }
  function Start-ScheduledTask { param($TaskName, $ErrorAction) if ($script:startFails) { throw 'nao iniciou' }; $script:events.Add('start') | Out-Null }
  Register-NextecPasswordTaskAndStart -Source 'x.ps1'
  Assert (($script:events -join ',') -eq 'register,start') "disparo imediato apos registrar: $($script:events -join ',')"
  $script:events.Clear(); $script:taskState = 'Running'
  Register-NextecPasswordTaskAndStart -Source 'x.ps1'
  Assert (($script:events -join ',') -eq 'register') 'tarefa ja em execucao nao pode ser disparada de novo'
  $script:events.Clear(); $script:taskState = 'Ready'; $script:startFails = $true
  Register-NextecPasswordTaskAndStart -Source 'x.ps1'
  Assert ($script:events -contains 'register' -and $script:events -notcontains 'start') 'falha ao iniciar nao pode derrubar o registro'
  $agentText = Get-Content -LiteralPath $agentPath -Raw -Encoding UTF8
  Assert ($agentText -match 'Register-NextecPasswordTaskAndStart -Source \$PSCommandPath') '-Registrar deve registrar e disparar a tarefa na hora'
  Write-Host 'PASS DisparoImediato_AposRegistrarOuReparar'
  Remove-Item Function:\Register-NextecPasswordTask, Function:\Get-ScheduledTask, Function:\Start-ScheduledTask -ErrorAction SilentlyContinue
  . $ImportAllFunctions $agentPath

  # ---------- 4. Sem execucao simultanea ----------
  $lockPath = Join-Path $tempRoot 'agente-senha.lock'
  function Assert-NextecNoReparsePoints($Path) { }
  $first = Enter-NextecAgentLock -Path $lockPath
  Assert ($null -ne $first) 'a primeira execucao deve obter a trava'
  Assert ($null -eq (Enter-NextecAgentLock -Path $lockPath)) 'a segunda execucao simultanea nao pode obter a trava'
  $first.Dispose()
  $third = Enter-NextecAgentLock -Path $lockPath
  Assert ($null -ne $third) 'a trava deve ser liberada ao fim da execucao'
  $third.Dispose()

  $script:PastaDados = $tempRoot; $script:runs = 0; $script:runResult = $true
  function Invoke-NextecAgentExecute { $script:runs++; return $script:runResult }
  $held = Enter-NextecAgentLock -Path (Join-Path $tempRoot 'agente-senha.lock')
  Assert ((Invoke-NextecAgentExecuteExclusive) -eq 'busy' -and $script:runs -eq 0) 'execucao com trava ocupada nao pode rodar o ciclo'
  $held.Dispose()
  Assert ((Invoke-NextecAgentExecuteExclusive) -eq 'ok' -and $script:runs -eq 1) 'execucao livre deve rodar o ciclo uma vez'
  $script:runResult = $false
  Assert ((Invoke-NextecAgentExecuteExclusive) -eq 'failed') 'falha do ciclo deve ser informada'
  $after = Enter-NextecAgentLock -Path (Join-Path $tempRoot 'agente-senha.lock')
  Assert ($null -ne $after) 'a trava deve ser liberada mesmo quando o ciclo falha'
  $after.Dispose()

  # Entre processos de verdade: um processo filho segura a trava enquanto o pai tenta entrar.
  $childLock = Join-Path $tempRoot 'filho.lock'
  $ready = Join-Path $tempRoot 'filho.pronto'
  $childScript = Join-Path $tempRoot 'filho.ps1'
  [IO.File]::WriteAllText($childScript, @"
`$ast = [Management.Automation.Language.Parser]::ParseFile('$($agentPath.Replace("'", "''"))', [ref]`$null, [ref]`$null)
foreach (`$n in 'Assert-NextecNoReparsePoints', 'Enter-NextecAgentLock') {
  `$f = `$ast.Find({ param(`$x) `$x -is [Management.Automation.Language.FunctionDefinitionAst] -and `$x.Name -eq `$n }, `$true)
  . ([scriptblock]::Create(`$f.Extent.Text))
}
`$l = Enter-NextecAgentLock -Path '$($childLock.Replace("'", "''"))'
Set-Content -LiteralPath '$($ready.Replace("'", "''"))' -Value 'ok'
Start-Sleep -Seconds 6
`$l.Dispose()
"@, $utf8Bom)
  $child = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $childScript + '"')) -PassThru -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(25)
  while (-not (Test-Path -LiteralPath $ready) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
  Assert (Test-Path -LiteralPath $ready) 'o processo filho nao obteve a trava'
  Assert ($null -eq (Enter-NextecAgentLock -Path $childLock)) 'outro processo conseguiu entrar enquanto o filho executava'
  $child.WaitForExit()
  $late = Enter-NextecAgentLock -Path $childLock
  Assert ($null -ne $late) 'a trava nao foi liberada quando o processo filho terminou'
  $late.Dispose()
  Write-Host 'PASS SemReentrada_UmaExecucaoPorVezEntreProcessos'

  # ---------- 5. Propor, aplicar e confirmar na MESMA execucao ----------
  . $ImportAllFunctions $agentPath
  $script:events = New-Object System.Collections.Generic.List[string]
  $script:waits = New-Object System.Collections.Generic.List[int]
  function Escrever([string]$msg) { Assert ($msg -notmatch 'candidate-secret') 'segredo no log' }
  function Write-NextecIdleLog([string]$Message) { }
  function Proteger($value) { return 'protected:' + $value }
  function Revelar($value) { return $value.Substring('protected:'.Length) }
  function Save-NextecAgentState($State) { }
  function SenhaForte { return 'candidate-secret-0123456789' }
  function Opcao($name, $value) { }
  function Wait-NextecRetry([int]$Seconds) { $script:waits.Add($Seconds) | Out-Null }
  function Get-NextecHttpStatus($Exception) { return [int]$script:failStatus }
  function InvocarRustDesk($Argumentos) {
    $script:events.Add('apply') | Out-Null
    $script:applyCalls++
    $out = if ($script:applyCalls -le $script:applyFailures) { 'Installation and administrative privileges required!' } else { 'Done!' }
    $code = if ($script:applyCalls -le $script:applyFailures) { 1 } else { 0 }
    return [pscustomobject]@{ ExitCode = $code; Output = $out }
  }
  function Chamar($path, $body) {
    switch ($path) {
      '/api/nextec/agent/sync' { $script:events.Add('sync') | Out-Null; return $script:syncResponse }
      '/api/nextec/agent/password' {
        $script:events.Add('password') | Out-Null; $script:proposeCalls++
        if ($script:proposeCalls -le $script:proposeFailures) { $script:failStatus = $script:proposeStatus; throw 'propose unavailable' }
        return [pscustomobject]@{ ok = $true; operation_id = $body.operation_id; pending_version = $body.pending_version }
      }
      '/api/nextec/agent/confirm' {
        $script:events.Add('confirm') | Out-Null; $script:confirmCalls++
        if ($script:confirmCalls -le $script:confirmFailures) { $script:failStatus = $script:confirmStatus; throw 'confirm unavailable' }
        return [pscustomobject]@{ ok = $true; active_version = $body.pending_version }
      }
    }
    throw 'rota inesperada'
  }
  function Reset-Case {
    $script:events.Clear(); $script:waits.Clear()
    $script:applyCalls = 0; $script:applyFailures = 0
    $script:proposeCalls = 0; $script:proposeFailures = 0; $script:proposeStatus = 0
    $script:confirmCalls = 0; $script:confirmFailures = 0; $script:confirmStatus = 0
    $script:failStatus = 0
    $script:syncResponse = [pscustomobject]@{
      managed = $true; rotate = $true; transaction_v1 = $true; recovery = $false
      approve_mode = 'password'; verification_method = 'use-permanent-password'
      operation = [pscustomobject]@{ operation_id = 'op-1'; pending_version = 2; pending_password = '' }
    }
    $script:cfg = [pscustomobject]@{ id = '536822159'; token = 'protected:token'; painel = 'https://example.invalid' }
    $script:Simular = $false; $script:Exe = 'client.exe'
  }

  Reset-Case
  Invoke-NextecPasswordCycle $cfg
  Assert (($events -join ',') -eq 'sync,password,apply,confirm') "ordem da transacao: $($events -join ',')"
  Assert (-not $cfg.applied_operation_id -and -not $cfg.pending_password) 'diario nao foi limpo apos confirmar'
  Write-Host 'PASS Transacao_ProporAplicarConfirmarNaMesmaExecucao'

  Reset-Case
  $confirmFailures = 1; $confirmStatus = 503
  Invoke-NextecPasswordCycle $cfg
  Assert (($events -join ',') -eq 'sync,password,apply,confirm,confirm') "confirmacao com falha transitoria nao foi repetida na mesma execucao: $($events -join ',')"
  Assert (-not $cfg.applied_operation_id) 'diario nao foi limpo apos a confirmacao repetida'
  Assert ($applyCalls -eq 1) 'a senha foi aplicada mais de uma vez sem necessidade'
  Write-Host 'PASS Transacao_ConfirmacaoRepetidaNaMesmaExecucao'

  Reset-Case
  $proposeFailures = 2; $proposeStatus = 0
  Invoke-NextecPasswordCycle $cfg
  Assert (($events -join ',') -eq 'sync,password,password,password,apply,confirm') "proposta com falha de rede nao foi repetida: $($events -join ',')"
  Write-Host 'PASS Transacao_PropostaRepetidaAntesDeAplicar'

  Reset-Case
  $applyFailures = 1
  Invoke-NextecPasswordCycle $cfg
  Assert (($events -join ',') -eq 'sync,password,apply,apply,confirm') "aplicacao recusada uma vez nao foi repetida antes de confirmar: $($events -join ',')"
  Assert ($confirmCalls -eq 1) 'confirmou mais de uma vez'
  Write-Host 'PASS Transacao_AplicacaoRepetidaEConfirmaSoDepoisDoOk'

  Reset-Case
  $applyFailures = 99
  try { Invoke-NextecPasswordCycle $cfg; throw 'esperava falha' } catch { Assert ($_.Exception.Message -match 'password_apply_failed') 'erro de aplicacao inesperado' }
  Assert ($events -notcontains 'confirm') 'confirmou uma senha que o app nunca aceitou'
  Assert ($applyCalls -eq 3) "limite de repeticao da aplicacao: $applyCalls"
  Assert (-not $cfg.applied_operation_id) 'diario marcou como aplicada uma senha recusada'
  Write-Host 'PASS Transacao_AplicacaoQueNuncaFunciona_NaoConfirma'

  Reset-Case
  $confirmFailures = 99; $confirmStatus = 401
  try { Invoke-NextecPasswordCycle $cfg; throw 'esperava falha' } catch { Assert ($_.Exception.Message -eq 'confirm unavailable') 'erro de confirmacao inesperado' }
  Assert ($confirmCalls -eq 1) '401 nao pode ser repetido na mesma execucao'
  $confirmFailures = 99; $confirmStatus = 409; $confirmCalls = 0
  try { Invoke-NextecPasswordCycle $cfg; throw 'esperava falha' } catch { }
  Assert ($confirmCalls -eq 1) '409 nao pode ser repetido na mesma execucao'
  Write-Host 'PASS Transacao_401E409NaoSaoRepetidos'

  Reset-Case
  $confirmFailures = 99; $confirmStatus = 0
  try { Invoke-NextecPasswordCycle $cfg; throw 'esperava falha' } catch { Assert ($_.Exception.Message -eq 'confirm unavailable') 'erro de confirmacao inesperado' }
  Assert ($confirmCalls -eq 3 -and ($waits -join ',') -eq '2,5') "repeticao limitada a 2 esperas curtas: calls=$confirmCalls waits=$($waits -join ',')"
  Assert ($cfg.applied_operation_id -eq 'op-1' -and $cfg.applied_pending_version -eq 2) 'rede fora do ar nao pode perder o diario aplicado'
  # proxima rodada: o painel ainda tem a proposta; o agente retoma sem gerar outra senha e confirma
  $confirmFailures = 0
  $syncResponse.recovery = $true
  $syncResponse.operation.pending_password = 'candidate-secret-0123456789'
  $events.Clear(); $applyCalls = 0
  Invoke-NextecPasswordCycle $cfg
  Assert (($events -join ',') -eq 'sync,apply,confirm') "retomada na proxima rodada: $($events -join ',')"
  Assert (-not $cfg.applied_operation_id) 'diario nao foi limpo na retomada'
  Write-Host 'PASS Transacao_RedeForaDoAr_RetomaNaProximaRodada'

  # classificacao de falha transitoria
  foreach ($status in 0, 408, 429, 500, 502, 503) { $script:failStatus = $status; Assert (Test-NextecTransientFailure $null) "status $status deveria ser transitorio" }
  foreach ($status in 400, 401, 403, 404, 409) { $script:failStatus = $status; Assert (-not (Test-NextecTransientFailure $null)) "status $status nao pode ser transitorio" }
  Write-Host 'PASS Transacao_ClassificacaoDeFalhaTransitoria'

  # ---------- 6. Log nao inunda ----------
  . $ImportAllFunctions $agentPath
  $script:PastaDados = Join-Path $tempRoot 'log'
  New-Item -ItemType Directory -Path $script:PastaDados | Out-Null
  $script:logged = 0
  function Escrever([string]$msg) { $script:logged++ }
  for ($i = 0; $i -lt 30; $i++) { Write-NextecIdleLog 'Sincronizacao concluida; nenhuma troca necessaria.' }
  Assert ($script:logged -eq 1) "a mesma linha foi gravada $($script:logged) vezes em 30 ciclos"
  Write-NextecIdleLog 'ERRO: sem rede'
  Assert ($script:logged -eq 2) 'mensagem diferente deve ser gravada na hora'
  (Get-Item -LiteralPath (Join-Path $script:PastaDados 'agente-senha.ocioso')).LastWriteTimeUtc = [DateTime]::UtcNow.AddHours(-2)
  Write-NextecIdleLog 'ERRO: sem rede'
  Assert ($script:logged -eq 3) 'a mesma mensagem deve voltar ao log depois de uma hora'
  Write-Host 'PASS Log_CicloOciosoNaoInunda'

  # ---------- 7. 429 do painel nao zera nem soma a contagem de 401 ----------
  . $ImportAllFunctions $agentPath
  $authRoot = Join-Path $tempRoot 'auth'
  New-Item -ItemType Directory -Path $authRoot | Out-Null
  $authConfig = Join-Path $authRoot 'agente-senha.json'
  $authCounter = Join-Path $authRoot 'agente-senha.falhas'
  Set-Content -LiteralPath $authConfig -Value '{"id":"536822159"}' -Encoding UTF8
  foreach ($status in @(401, 429, 401)) {
    Assert (-not (Update-NextecAuthFailures -Status $status -CounterPath $authCounter -ConfigPath $authConfig -DataRoot $authRoot)) "status $status nao pode aposentar ainda"
  }
  Assert (Update-NextecAuthFailures -Status 401 -CounterPath $authCounter -ConfigPath $authConfig -DataRoot $authRoot) '429 no meio zerou a contagem: o terceiro 401 deveria aposentar'
  Write-Host 'PASS Auth_429NaoZeraNemSomaA401'

  Write-Host 'Todos os testes de latencia da troca de senha passaram.'
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
