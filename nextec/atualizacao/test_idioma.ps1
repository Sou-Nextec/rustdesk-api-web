#requires -version 5.1
# O agente decide e registra a mesma coisa em QUALQUER idioma/cultura do Windows: conta por SID (nunca pelo nome
# localizado) e data de log em InvariantCulture (th-TH e ar-SA mudam o ano; fi-FI e outros mudam o separador de hora).
# Roda as funcoes REAIS de Provisionar, Coordenar, Agente-Senha e Instalar com a cultura do processo trocada.
$ErrorActionPreference = 'Stop'
function Get-FunctionTexts([string]$File, [string[]]$Names, [hashtable]$Rename = @{}) {
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $File), [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw "$File syntax invalid" }
  foreach ($fn in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
    if ($Names -and $Names -notcontains $fn.Name) { continue }
    $text = $fn.Extent.Text
    if ($Rename.ContainsKey($fn.Name)) { $text = $text.Replace('function ' + $fn.Name, 'function ' + $Rename[$fn.Name]) }
    $text
  }
}
$loaded = @()
$loaded += Get-FunctionTexts 'Provisionar-Agente-Nextec.ps1' $null
$loaded += Get-FunctionTexts 'Coordenar-Agente-Nextec.ps1' @('Write-NextecCoordinatorLog')
$loaded += Get-FunctionTexts 'Agente-Senha-Nextec.ps1' @('Escrever')
$loaded += Get-FunctionTexts 'Instalar-Nextec.ps1' @('Escrever') @{ Escrever = 'EscreverInstalar' }
foreach ($t in $loaded) { . ([scriptblock]::Create($t)) }
function Set-Acl { param($LiteralPath, $AclObject) }
function Assert-NextecProvisionFileAcl { param($Path) }
function Assert-NextecCoordinatorPath { param($Path) }
function Assert($v, [string]$m) { if (-not $v) { throw $m } }

$root = Join-Path ([IO.Path]::GetTempPath()) ('nextec-idioma-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
$PastaDados = $root; $Log = Join-Path $root 'agente-senha.log'; $Instalar = $false; $Simular = $false; $Silencioso = $true
$script:PastaSegura = $true
$logInst = Join-Path $root 'instalar.log'
$stamp = '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}( |  )'
$year = [DateTime]::UtcNow.Year
$saved = @([Threading.Thread]::CurrentThread.CurrentCulture, [Threading.Thread]::CurrentThread.CurrentUICulture)
$sysNt = (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')).Translate([Security.Principal.NTAccount]).Value
$sysShort = $sysNt.Substring($sysNt.LastIndexOf('\') + 1)
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$rootTask = Join-Path $env:ProgramData 'Nextec\Acesso'
function New-Task($user) {
  [pscustomobject]@{ State = 'Ready'; Principal = [pscustomobject]@{ UserId = $user; RunLevel = 'Highest' }
    Actions = @([pscustomobject]@{ Execute = $psExe; Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $rootTask 'Agente-Senha-Nextec.ps1') + '" -Executar') })
    Triggers = @([pscustomobject]@{ Repetition = [pscustomobject]@{ Interval = 'PT1M' } }) }
}
try {
  foreach ($name in @('pt-BR', 'en-US', 'es-ES', 'de-DE', 'fr-FR', 'fi-FI', 'th-TH', 'ar-SA')) {
    $c = [Globalization.CultureInfo]::GetCultureInfo($name)
    [Threading.Thread]::CurrentThread.CurrentCulture = $c
    [Threading.Thread]::CurrentThread.CurrentUICulture = $c
    foreach ($f in @($Log, $logInst, (Join-Path $root 'coordenador.log'), (Get-NextecProvisionPaths -Root $root).Log)) { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force } }

    Write-NextecProvisionLog -Code 'complete' -Root $root
    $line = Get-Content -LiteralPath (Get-NextecProvisionPaths -Root $root).Log | Select-Object -First 1
    Assert ($line -cmatch ($stamp + '?complete$') -and [int]$line.Substring(0, 4) -in ($year - 1)..($year + 1)) "[$name] log do provisionador: $line"

    Write-NextecCoordinatorLog -Root $root -Message 'teste'
    $line = Get-Content -LiteralPath (Join-Path $root 'coordenador.log') | Select-Object -First 1
    Assert ($line -cmatch $stamp -and [int]$line.Substring(0, 4) -in ($year - 1)..($year + 1)) "[$name] log do coordenador: $line"

    Escrever 'teste'
    $line = Get-Content -LiteralPath $Log | Select-Object -First 1
    Assert ($line -cmatch $stamp -and [int]$line.Substring(0, 4) -in ($year - 1)..($year + 1)) "[$name] log do agente: $line"

    $Log2 = $Log; $Log = $logInst
    EscreverInstalar 'teste'
    $line = Get-Content -LiteralPath $logInst | Select-Object -First 1
    $Log = $Log2
    Assert ($line -cmatch $stamp -and [int]$line.Substring(0, 4) -in ($year - 1)..($year + 1)) "[$name] log do instalador: $line"

    # conta SYSTEM por SID: nome em ingles, o do Windows desta maquina (curto e completo), SID; nada mais vale
    foreach ($ok in @('SYSTEM', $sysShort, $sysNt, 'S-1-5-18', 'NT AUTHORITY\SYSTEM')) {
      Assert (Test-NextecAgentTaskShape -Task (New-Task $ok) -Root $rootTask) "[$name] conta '$ok' deveria valer"
    }
    foreach ($bad in @('Administrators', 'Administradores', 'Administratoren', 'Users', 'Usuarios', 'Everyone', 'Todos', 'S-1-5-19', 'S-1-1-0', '', 'SYSTEMX')) {
      Assert (-not (Test-NextecAgentTaskShape -Task (New-Task $bad) -Root $rootTask)) "[$name] conta '$bad' nao pode valer"
    }
    Write-Host "PASS Idioma_$name (SYSTEM local: $sysNt)"
  }
} finally {
  [Threading.Thread]::CurrentThread.CurrentCulture = $saved[0]
  [Threading.Thread]::CurrentThread.CurrentUICulture = $saved[1]
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}
