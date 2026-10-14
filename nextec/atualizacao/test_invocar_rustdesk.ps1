#requires -version 5.1
# O rustdesk.exe e um programa de janela (subsistema GUI). InvocarRustDesk precisa esperar o processo e capturar saida e
# codigo de saida de verdade: `$x = & exe args` do PowerShell nao faz isso com executaveis GUI (o --password rodava sem
# ninguem conferir o "Done!", e o agente acusava "nao confirmou a aplicacao").
$ErrorActionPreference = 'Stop'
$agentScript = Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1'
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($agentScript, [ref]$null, [ref]$errors)
if ($errors.Count) { throw 'Agente-Senha-Nextec.ps1 nao compilou' }
foreach ($name in @('ConvertTo-NextecArgument', 'InvocarRustDesk')) {
  $f = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
  if (-not $f) { throw "Funcao ausente: $name" }
  . ([scriptblock]::Create($f.Extent.Text))
}
function Assert([bool]$c, [string]$m) { if (-not $c) { throw "ASSERT: $m" } }

# argumentos
Assert ((ConvertTo-NextecArgument 'abc-123') -ceq 'abc-123') 'argumento simples sem aspas'
Assert ((ConvertTo-NextecArgument 'a b') -ceq '"a b"') 'espaco exige aspas'
Assert ((ConvertTo-NextecArgument 'a"b') -ceq '"a\"b"') 'aspas escapadas'
Assert ((ConvertTo-NextecArgument 'fim\') -ceq '"fim\\"') 'barra final dobrada'
Assert ((ConvertTo-NextecArgument '') -ceq '""') 'vazio vira aspas vazias'
Write-Host 'PASS Arguments_AreQuotedForTheWindowsCommandLine'

$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$dir = Join-Path ([IO.Path]::GetTempPath()) ('nextec-gui-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
try {
  if (-not (Test-Path -LiteralPath $compiler)) { Write-Host 'SKIP: compilador C# indisponivel'; return }
  $cs = Join-Path $dir 'fake.cs'
  [IO.File]::WriteAllText($cs, @'
using System;
using System.Threading;
internal static class Fake {
    private static int Main(string[] args) {
        // GUI (winexe), demora um pouco e so entao responde, como o IPC do RustDesk
        Thread.Sleep(600);
        if (args.Length > 0 && args[0] == "--falha") { Console.Error.WriteLine("Settings are disabled!"); return 7; }
        Console.Out.WriteLine("Done!");
        Console.Out.WriteLine("args=" + String.Join("|", args));
        return 0;
    }
}
'@)
  $exe = Join-Path $dir 'fake gui.exe'
  & $compiler /nologo /target:winexe "/out:$exe" $cs | Out-Null
  if (-not (Test-Path -LiteralPath $exe)) { throw 'nao compilou o GUI de teste' }

  function ClienteInstalado { [pscustomobject]@{ ExePath = $exe; PeerId = '1' } }

  # o comportamento do PowerShell que causou o bug: atribuir a saida de um GUI nao espera nem captura
  $assigned = & $exe --password abc 2>&1
  Write-Host ("INFO atribuicao direta: [" + ((@($assigned) -join ' ')) + "]")

  $r = InvocarRustDesk -Argumentos @('--password', 'Abc123')
  Assert ($r.ExitCode -eq 0) "codigo de saida real: $($r.ExitCode)"
  Assert ($r.Output -match '(?m)^Done!') "saida capturada: [$($r.Output)]"
  Assert ($r.Output -match 'args=--password\|Abc123') "argumentos entregues: [$($r.Output)]"
  Write-Host 'PASS Invocar_WaitsForGuiProcessAndCapturesOutput'

  $r = InvocarRustDesk -Argumentos @('--falha')
  Assert ($r.ExitCode -eq 7) "codigo de falha real: $($r.ExitCode)"
  Assert ($r.Output -match 'Settings are disabled!') "stderr capturado: [$($r.Output)]"
  Write-Host 'PASS Invocar_ReportsExitCodeAndStderr'

  $r = InvocarRustDesk -Argumentos @('--option', 'chave com espaco', 'va"lor')
  Assert ($r.Output -match 'args=--option\|chave com espaco\|va"lor') "argumentos com espaco e aspas: [$($r.Output)]"
  Write-Host 'PASS Invocar_PassesSpacesAndQuotesIntact'
} finally { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host 'Todos os testes do invocador do RustDesk passaram.'
