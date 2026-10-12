<#
Assina a versao pendente do Nextec Connect em um comando.
Fluxo: pedido do painel -> confere hash/produto/versao -> senha da chave (so aqui) -> assina -> envia -> confirma.
Reaproveita o assinador existente (assinar-pedido-connect.py); a criptografia nao foi reescrita.
Texto ASCII de proposito: o arquivo precisa funcionar no Windows PowerShell 5.1 sem depender de codificacao.
#>
param(
    [string]$Versao,
    [string]$Config,
    [string]$AssinadorDir,
    [string]$Pedido,
    [string]$Msi,
    [string]$SaidaRoot,
    [switch]$SemEnviar,
    [switch]$Reconfigurar,
    [scriptblock]$LeitorSenha
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 5) { throw 'Use o Windows PowerShell 5.1 ou superior.' }
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$script:PainelPadrao = 'https://painel-remoto.nex.tec.br'
$script:ChavePadrao = Join-Path $HOME '.nextec\nextec-atualizador-privada.pem'
if (-not $AssinadorDir) { $AssinadorDir = $PSScriptRoot }
. (Join-Path $AssinadorDir 'Connect-SigningSession.ps1')

function Get-ConfigPath([string]$Override) {
    if ($Override) { return $Override }
    if (-not $env:LOCALAPPDATA) { throw 'Execute no perfil Windows do operador.' }
    return (Join-Path $env:LOCALAPPDATA 'Nextec\assinador.json')
}

function Read-AssinadorConfig([string]$Path) {
    $cfg = @{ chave = ''; painel = $script:PainelPadrao }
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        try {
            $raw = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
            if ($raw.chave) { $cfg.chave = [string]$raw.chave }
            if ($raw.painel) { $cfg.painel = [string]$raw.painel }
        } catch { throw "Arquivo de configuracao ilegivel: $Path" }
    }
    return $cfg
}

function Save-AssinadorConfig([string]$Path, $Cfg) {
    $dir = Split-Path -Parent $Path
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $json = ([pscustomobject]@{ chave = $Cfg.chave; painel = $Cfg.painel } | ConvertTo-Json)
    [IO.File]::WriteAllText($Path, $json, (New-Object Text.UTF8Encoding($false)))
}

function Test-PainelUrl([string]$Url) {
    $uri = $null
    if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri)) { return $false }
    if ($uri.Scheme -eq 'https') { return $true }
    return ($uri.Scheme -eq 'http' -and ($uri.Host -eq '127.0.0.1' -or $uri.Host -eq 'localhost'))
}

function ConvertTo-PlainText([Security.SecureString]$Secure) {
    $bstr = [IntPtr]::Zero
    try {
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($Secure)
        return [Runtime.InteropServices.Marshal]::PtrToStringUni($bstr)
    } finally {
        if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($bstr) }
    }
}

# Sessao do painel: dois valores protegidos por DPAPI (so este usuario neste computador le).
function Get-SessaoPath([string]$ConfigPath) { return (Join-Path (Split-Path -Parent $ConfigPath) 'assinador-sessao.xml') }

function Read-PainelSessao([string]$ConfigPath) {
    $p = Get-SessaoPath $ConfigPath
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return $null }
    try {
        $o = Import-Clixml -LiteralPath $p
        if ($o.Token -isnot [Security.SecureString]) { return $null }
        return $o
    } catch { return $null }
}

function Save-PainelSessao([string]$ConfigPath, [Security.SecureString]$Token, [Security.SecureString]$Acesso) {
    $dir = Split-Path -Parent $ConfigPath
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [pscustomobject]@{ Token = $Token; Acesso = $Acesso } | Export-Clixml -LiteralPath (Get-SessaoPath $ConfigPath)
}

function Remove-PainelSessao([string]$ConfigPath) {
    $p = Get-SessaoPath $ConfigPath
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
}

function Invoke-Painel([string]$Painel, $Sessao, [string]$Method, [string]$Path, $Body) {
    $headers = @{ 'api-token' = (ConvertTo-PlainText $Sessao.Token) }
    $args2 = @{ Uri = ($Painel.TrimEnd('/') + $Path); Method = $Method; Headers = $headers; UseBasicParsing = $true; UserAgent = 'Nextec-Assinador/1.0'; TimeoutSec = 60 }
    if ($Sessao.Acesso -is [Security.SecureString] -and $Sessao.Acesso.Length -gt 0) {
        # Cookie nao pode ir em -Headers no 5.1 (cabecalho restrito): usa WebRequestSession.
        $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        $uriBase = [Uri]$Painel
        $ws.Cookies.Add($uriBase, (New-Object Net.Cookie('CF_Authorization', (ConvertTo-PlainText $Sessao.Acesso), '/', $uriBase.Host)))
        $args2.WebSession = $ws
    }
    if ($null -ne $Body) {
        $args2.Body = ([Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress)))
        $args2.ContentType = 'application/json; charset=utf-8'
    }
    try { $r = Invoke-WebRequest @args2 } catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($status -eq 401 -or $status -eq 403) { throw 'SESSAO_EXPIRADA' }
        throw ('Falha ao falar com o painel (HTTP ' + $status + ').')
    }
    $text = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    if ($text.TrimStart().StartsWith('<')) { throw 'SESSAO_EXPIRADA' }
    $obj = $text | ConvertFrom-Json
    if ($null -ne $obj.code -and [int]$obj.code -ne 0) { throw ('O painel recusou: ' + [string]$obj.message) }
    return $obj.data
}

function Select-VersaoPendente($Dados, [string]$Pedida) {
    $lista = [System.Collections.Generic.List[object]]::new()
    foreach ($r in @($Dados.releases)) { if ($r -and $r.version) { $lista.Add($r) } }
    $itens = $lista.ToArray()
    if ($Pedida) {
        $m = @($itens | Where-Object { $_.version -eq $Pedida })
        if ($m.Count -ne 1) { throw "Versao $Pedida nao encontrada em Atualizacoes." }
        return [string]$m[0].version
    }
    $pend = @($itens | Where-Object { -not $_.signed } | Sort-Object { try { [version]$_.version } catch { [version]'0.0' } } -Descending)
    if ($pend.Count -eq 0) { throw 'Nenhuma versao pendente de autorizacao.' }
    return [string]$pend[0].version
}

function Assert-PedidoValido($P, [string]$Versao) {
    if ($P.produto -ne 'nextec-connect') { throw 'O pedido nao e do produto nextec-connect.' }
    if ([int]$P.formato -ne 1) { throw 'Formato de pedido desconhecido.' }
    if ([string]$P.versao -ne $Versao) { throw 'O pedido pertence a outra versao.' }
    if ([int64]$P.sequencia -lt 1) { throw 'Sequencia invalida no pedido.' }
    $assets = [System.Collections.Generic.List[object]]::new()
    if ($P.windows) {
        if ([string]$P.windows.arquivo -ne ('files/nextec-acesso-' + $Versao + '.msi')) { throw 'Nome do MSI fora do padrao.' }
        $assets.Add(@{ k = 'windows'; a = $P.windows })
    }
    if ($P.linux) {
        foreach ($arch in @('amd64', 'arm64')) {
            $a = $P.linux.$arch
            if ($a) {
                if ([string]$a.arquivo -ne ('files/nextec-acesso-' + $Versao + '-' + $arch + '.deb')) { throw "Nome do DEB $arch fora do padrao." }
                $assets.Add(@{ k = $arch; a = $a })
            }
        }
    }
    if ($assets.Count -eq 0) { throw 'O pedido nao lista nenhum pacote.' }
    foreach ($it in $assets.ToArray()) {
        if ([string]$it.a.sha256 -notmatch '^[0-9a-f]{64}$') { throw 'SHA-256 invalido no pedido.' }
        if ([int64]$it.a.tamanho -lt 1 -or [int64]$it.a.tamanho -gt 314572800) { throw 'Tamanho invalido no pedido.' }
    }
}

function Get-Pacote([string]$Painel, $Asset, [string]$DestDir) {
    $nome = Split-Path -Leaf ([string]$Asset.arquivo)
    if ($nome -notmatch '^nextec-acesso-[0-9.]+(-(amd64|arm64))?\.(msi|deb)$') { throw 'Nome de pacote invalido.' }
    $dest = Join-Path $DestDir $nome
    $uri = $Painel.TrimEnd('/') + '/api/nextec/update/' + [string]$Asset.arquivo
    Invoke-WebRequest -Uri $uri -OutFile $dest -UseBasicParsing -UserAgent 'Nextec-Assinador/1.0' -TimeoutSec 600
    Assert-PacoteConfere $dest $Asset
    return $dest
}

function Assert-PacoteConfere([string]$Path, $Asset) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Pacote local nao encontrado: $Path" }
    if ((Get-Item -LiteralPath $Path).Length -ne [int64]$Asset.tamanho) { throw 'O tamanho do pacote nao confere com o pedido.' }
    $h = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($h -ne ([string]$Asset.sha256).ToLowerInvariant()) { throw 'O SHA-256 do pacote nao confere com o pedido.' }
}

function Find-Ferramentas {
    $r = @{}
    if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
        $git = Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe'
        if (Test-Path -LiteralPath $git) { $env:PATH = (Split-Path -Parent $git) + ';' + $env:PATH }
        else { throw 'OpenSSL nao encontrado. Instale o Git for Windows ou coloque o OpenSSL no PATH.' }
    }
    $r.Python = $null; $r.PyArgs = @()
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        & $py.Source -3 --version *> $null
        if ($LASTEXITCODE -eq 0) { $r.Python = $py.Source; $r.PyArgs = @('-3') }
    }
    if (-not $r.Python) {
        $py = Get-Command python -ErrorAction SilentlyContinue
        if (-not $py) { throw 'Python 3 nao encontrado.' }
        $r.Python = $py.Source
    }
    return $r
}

function Invoke-Assinador($Ferr, [string]$Helper, [string]$PedidoPath, [string]$Msi, [string]$Amd64, [string]$Arm64, [string]$Chave, [string]$SaidaRoot, [Security.SecureString]$Senha) {
    $argsPy = Get-ConnectSignerArguments -Helper $Helper -Pedido $PedidoPath -Msi $Msi -DebAmd64 $Amd64 -DebArm64 $Arm64 -Chave $Chave -SaidaRoot $SaidaRoot
    $all = [System.Collections.Generic.List[string]]::new()
    foreach ($a in $Ferr.PyArgs) { $all.Add([string]$a) }
    foreach ($a in $argsPy) { $all.Add([string]$a) }
    $si = New-Object System.Diagnostics.ProcessStartInfo
    $si.FileName = $Ferr.Python
    # O launcher py nao reconhece "-3" entre aspas: so cita o argumento que precisa.
    $si.Arguments = (($all.ToArray() | ForEach-Object { if ([string]$_ -match '^[A-Za-z0-9_.:=\/-]+$') { [string]$_ } else { '"' + ([string]$_).Replace('"', '\"') + '"' } }) -join ' ')
    $si.UseShellExecute = $false
    $si.RedirectStandardInput = $true
    $si.RedirectStandardOutput = $true
    $si.RedirectStandardError = $true
    $si.StandardOutputEncoding = [Text.Encoding]::UTF8
    $si.StandardErrorEncoding = [Text.Encoding]::UTF8
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $si
    $old = [Console]::InputEncoding
    try {
        [Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
        if (-not $p.Start()) { throw 'Nao foi possivel iniciar o assinador local.' }
        Write-ConnectSigningPassphrase -Process $p -Passphrase $Senha
        $p.StandardInput.BaseStream.Close()
        $out = $p.StandardOutput.ReadToEndAsync()
        $err = $p.StandardError.ReadToEndAsync()
        if (-not $p.WaitForExit(300000)) { Stop-ConnectProcessTree -Process $p; throw 'O assinador demorou demais.' }
        $o = $out.Result; $e = $err.Result
        if ($p.ExitCode -ne 0) { return @{ Ok = $false; Erro = $e.Trim() } }
        $m = [regex]::Match($o, 'validado:\s*(.+)')
        if (-not $m.Success) { return @{ Ok = $false; Erro = 'Saida do assinador nao reconhecida.' } }
        return @{ Ok = $true; Pasta = $m.Groups[1].Value.Trim() }
    } finally {
        [Console]::InputEncoding = $old
        try { $p.Dispose() } catch {}
    }
}

function Read-SenhaChave([scriptblock]$Leitor) {
    if ($Leitor) { return (& $Leitor) }
    return (Read-Host 'Senha da chave de assinatura (so esta janela recebe)' -AsSecureString)
}

function Start-AssinarVersao {
    $cfgPath = Get-ConfigPath $Config
    $cfg = Read-AssinadorConfig $cfgPath
    if (-not (Test-PainelUrl $cfg.painel)) { throw 'Endereco do painel invalido (precisa ser https).' }
    if ($Reconfigurar) { $cfg.chave = '' }
    if (-not $cfg.chave -or -not (Test-Path -LiteralPath $cfg.chave -PathType Leaf)) {
        $sug = ''
        if (Test-Path -LiteralPath $script:ChavePadrao -PathType Leaf) { $sug = $script:ChavePadrao }
        $msg = 'Caminho da chave privada cifrada'
        if ($sug) { $msg += " [Enter usa $sug]" }
        $entrada = (Read-Host $msg).Trim().Trim('"')
        if (-not $entrada) { $entrada = $sug }
        if (-not $entrada -or -not (Test-Path -LiteralPath $entrada -PathType Leaf)) { throw 'Chave nao encontrada.' }
        $cfg.chave = $entrada
        Save-AssinadorConfig $cfgPath $cfg
        Write-Host "Configuracao salva em $cfgPath"
    }
    $helper = Join-Path $AssinadorDir 'assinar-pedido-connect.py'
    if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) { throw "Assinador nao encontrado em $AssinadorDir" }
    $ferr = Find-Ferramentas
    & $ferr.Python @($ferr.PyArgs) $helper --validar-chave --chave $cfg.chave | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'A chave informada nao e um PEM RSA cifrado suportado (chave sem senha e recusada).' }

    $temp = Join-Path ([IO.Path]::GetTempPath()) ('nextec-assinar-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    try {
        $sessao = if ($Pedido) { $null } else { Read-PainelSessao $cfgPath }
        if (-not $Pedido -and -not $sessao) {
            Write-Host 'Primeira vez: cole os dois valores da sessao do painel (ficam protegidos neste usuario Windows).'
            Write-Host 'Veja ASSINATURA.md. Deixe o segundo em branco se o painel nao usar Cloudflare Access.'
            $t = Read-Host 'api-token do painel' -AsSecureString
            $a = Read-Host 'Cookie CF_Authorization (opcional)' -AsSecureString
            if ($t.Length -eq 0) { throw 'Token do painel e obrigatorio.' }
            $sessao = [pscustomobject]@{ Token = $t; Acesso = $a }
            Save-PainelSessao $cfgPath $t $a
        }
        $painel = $cfg.painel
        $versaoAlvo = $Versao
        $pedidoObj = $null
        $pedidoPath = $Pedido
        try {
            if (-not $Pedido) {
                $dados = Invoke-Painel $painel $sessao 'GET' '/api/admin/nextec/updates' $null
                $versaoAlvo = Select-VersaoPendente $dados $Versao
                Write-Host "Versao pendente: $versaoAlvo"
                $pedidoObj = Invoke-Painel $painel $sessao 'POST' '/api/admin/nextec/updates/sign-request' @{ version = $versaoAlvo }
                $pedidoPath = Join-Path $temp 'pedido.json'
                [IO.File]::WriteAllText($pedidoPath, ($pedidoObj | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
            } else {
                $pedidoObj = Get-Content -Raw -LiteralPath $Pedido | ConvertFrom-Json
                $versaoAlvo = [string]$pedidoObj.versao
            }
        } catch {
            if ($_.Exception.Message -eq 'SESSAO_EXPIRADA') {
                Remove-PainelSessao $cfgPath
                throw 'Sessao do painel expirada. Rode de novo e cole um token novo (ASSINATURA.md).'
            }
            throw
        }
        Assert-PedidoValido $pedidoObj $versaoAlvo
        Write-Host ("Pedido conferido: versao {0}, sequencia {1}." -f $pedidoObj.versao, $pedidoObj.sequencia)

        $msiPath = $null; $amd64 = $null; $arm64 = $null
        if ($pedidoObj.windows) {
            if ($Msi) { Assert-PacoteConfere $Msi $pedidoObj.windows; $msiPath = $Msi }
            else { Write-Host 'Baixando e conferindo o MSI...'; $msiPath = Get-Pacote $painel $pedidoObj.windows $temp }
        }
        if ($pedidoObj.linux -and $pedidoObj.linux.amd64) { $amd64 = Get-Pacote $painel $pedidoObj.linux.amd64 $temp }
        if ($pedidoObj.linux -and $pedidoObj.linux.arm64) { $arm64 = Get-Pacote $painel $pedidoObj.linux.arm64 $temp }

        $saida = $SaidaRoot
        if (-not $saida) { $saida = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Nextec\Connect\Releases' }
        $pasta = $null
        for ($i = 1; $i -le 3 -and -not $pasta; $i++) {
            $senha = Read-SenhaChave $LeitorSenha
            if ($null -eq $senha -or $senha.Length -eq 0) { throw 'A senha nao pode ficar vazia.' }
            try {
                $res = Invoke-Assinador $ferr $helper $pedidoPath $msiPath $amd64 $arm64 $cfg.chave $saida $senha
            } finally { $senha.Dispose() }
            if ($res.Ok) { $pasta = $res.Pasta }
            else {
                Write-Host ('Falhou: ' + $res.Erro)
                if ($i -eq 3) { throw 'Assinatura nao concluida.' }
                Write-Host 'Tente a senha de novo.'
            }
        }
        Write-Host "Manifesto e assinatura gravados em $pasta"
        if ($SemEnviar -or $Pedido) {
            Write-Host 'Envie os dois arquivos em Atualizacoes > Autorizar.'
            return $pasta
        }
        $man = [IO.File]::ReadAllBytes((Join-Path $pasta 'manifesto-connect.json'))
        $sig = ([IO.File]::ReadAllText((Join-Path $pasta 'manifesto-connect.json.sig'))).Trim()
        [void](Invoke-Painel $painel $sessao 'POST' '/api/admin/nextec/updates/signature' @{ version = $versaoAlvo; manifesto = [Convert]::ToBase64String($man); assinatura = $sig })
        $depois = Invoke-Painel $painel $sessao 'GET' '/api/admin/nextec/updates' $null
        $rel = @(@($depois.releases) | Where-Object { $_.version -eq $versaoAlvo })
        if ($rel.Count -eq 1 -and $rel[0].signed) { Write-Host "Versao $versaoAlvo AUTORIZADA no painel. Publique primeiro para o grupo piloto." }
        else { throw 'Enviado, mas o painel nao mostra a versao como autorizada. Confira em Atualizacoes.' }
        return $pasta
    } finally {
        Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try { [void](Start-AssinarVersao) } catch {
        Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
        exit 1
    }
}
