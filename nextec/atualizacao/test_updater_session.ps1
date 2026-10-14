#requires -version 5.1
# O atualizador nao derruba um atendimento: com sessao remota ativa (processo --cm) a atualizacao fica para depois.
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Instalar-Nextec.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Updater syntax invalid' }
$f = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Test-NextecSessaoAtiva' }, $true)
if (-not $f) { throw 'Test-NextecSessaoAtiva ausente' }
. ([scriptblock]::Create($f.Extent.Text))
function Assert([bool]$c, [string]$m) { if (-not $c) { throw "ASSERT: $m" } }
function P([string]$line, [string]$exe = '') { [pscustomobject]@{ CommandLine = $line; ExecutablePath = $exe } }

$exe = 'C:\Program Files\Client-Nextec-Connect\Client-Nextec-Connect.exe'
Assert (-not (Test-NextecSessaoAtiva -Processos @())) 'sem processos nao ha sessao'
Assert (-not (Test-NextecSessaoAtiva -Processos @((P "`"$exe`" --service" $exe), (P "`"$exe`" --tray" $exe), (P 'notepad.exe' 'C:\Windows\notepad.exe')))) 'servico e bandeja nao sao sessao'
Assert (Test-NextecSessaoAtiva -Processos @((P "`"$exe`" --service" $exe), (P "`"$exe`" --cm" $exe))) '--cm e sessao ativa'
Assert (Test-NextecSessaoAtiva -Processos @((P "`"$exe`" --cm-no-ui" $exe))) '--cm-no-ui tambem e sessao ativa'
Assert (Test-NextecSessaoAtiva -Processos @((P "$exe --cm")) -ExePath $exe) 'sem ExecutablePath conhecido vale como sessao'
Assert (-not (Test-NextecSessaoAtiva -Processos @((P '"C:\Program Files\RustDesk\rustdesk.exe" --cm' 'C:\Program Files\RustDesk\rustdesk.exe')) -ExePath $exe)) 'sessao de outro app nao bloqueia este'
Assert (Test-NextecSessaoAtiva -Processos @((P '"C:\Program Files\RustDesk\rustdesk.exe" --cm' 'C:\Program Files\RustDesk\rustdesk.exe'))) 'sem ExePath, qualquer cliente conta'
Assert (-not (Test-NextecSessaoAtiva -Processos @((P "`"$exe`" --cmd-qualquer" $exe)))) '--cmd-qualquer nao e --cm'
Assert (-not (Test-NextecSessaoAtiva -Processos @((P $null $null), (P '' '')))) 'linha de comando vazia nao e sessao'
# consulta real da maquina: nao pode lancar
[void](Test-NextecSessaoAtiva)
# o fluxo principal consulta antes de baixar e respeita -Forcar
$source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Instalar-Nextec.ps1'))
Assert ($source.Contains('$guardarSessao = (-not $Forcar -and -not $SoVerificar -and $instalada)')) 'a guarda de sessao precisa ignorar -Forcar e a primeira instalacao'
$download = $source.IndexOf('# 3. baixar e conferir')
$instalar = $source.IndexOf("Escrever 'Instalando...'")
$primeira = $source.IndexOf('Test-NextecSessaoAtiva -ExePath $exeAtual')
$segunda = $source.IndexOf('Test-NextecSessaoAtiva -ExePath $exeAtual', $primeira + 1)
$msiexec = $source.IndexOf("System32\msiexec.exe')", $download)
Assert ($primeira -gt 0 -and $primeira -lt $download) 'a guarda de sessao precisa vir antes do download'
# revisao do #89: uma sessao que comeca durante o download tambem precisa segurar a instalacao
Assert ($segunda -gt $download -and $segunda -lt $instalar -and $instalar -lt $msiexec) 'a guarda de sessao precisa ser repetida logo antes do msiexec'
Write-Host 'Atualizador respeita sessao remota ativa: PASS'
