# Novidades do painel Nextec

Cada versão segue o padrão `maior.menor.correção`. Esta página aparece no painel em **Novidades** (menu do usuário).

## 2.11.20

Conectar abre o app direto, com o protocolo da própria máquina, e avisa quando a senha automática ainda não foi aplicada.

- **Abre direto, sem diálogo:** ao clicar em Conectar (Senhas dos servidores, Dispositivos, Acesso rápido, Meus dispositivos, Salvos, Compartilhados, lista de espera e busca do topo), o painel dispara o protocolo na hora quando o app já abriu com sucesso antes neste navegador (lembrança por protocolo em `localStorage`, com tratamento de erro) ou quando a máquina tem agente ativo. Aparece só um aviso curto por 8 s ("Abrindo o <app>...") com o link discreto "Não abriu? Baixar aplicativo", que leva ao diálogo completo. O diálogo completo continua na primeira vez e em "Não abriu?". A abertura é detectada por perda de foco ou aba oculta, com prazo; se não abriu, a lembrança é esquecida e a próxima vez cai no diálogo. O nome do app mostrado vem do que a máquina informou (sem nome fixo no painel).
- **Protocolo por máquina, sem literal:** o agente envia o `AppName` do marcador (`HKLM\SOFTWARE\Nextec\Agente` ou `nextec-marker.json`) como `app_name` no `/api/nextec/agent/sync` e o painel monta o link com o nome normalizado em minúsculas (o RustDesk registra o protocolo com o nome do app em minúsculas: `Client-Nextec-Connect` abre `client-nextec-connect://`). Sem nome informado, vale o protocolo global configurado em Dispositivos > Gerar cliente (patch 0020), que passa a ser só o fallback. Patch novo `0036-app-name-por-maquina.patch`, aditivo e retrocompatível (coluna nova; agente antigo e painel antigo continuam funcionando), com validação `[A-Za-z0-9-]{1,64}`, lista de protocolos proibidos (http, https, file, javascript, data...) e só máquina aprovada decide o protocolo. A resposta de `/my/connect-link` ganhou `scheme`, `scheme_source`, `app_name`, `agent_active`, `password_state` e `last_seen_at`; a lista de Senhas dos servidores mostra o app da máquina.
- **Senha ainda não aplicada:** com agente ativo e regra ligada, mas "Aguardando a primeira troca", Conectar não abre em silêncio para cair no pedido de senha. Mostra "A senha automática ainda não foi aplicada nesta máquina (próxima verificação em ~N min). Você pode conectar e digitar a senha, ou aguardar." com [Conectar mesmo assim] e, para administrador, [Trocar agora]; os demais veem [Aguardar]. O aviso só aparece para quem receberia a senha do cofre.
- **Agente:** `Agente-Senha-Nextec.ps1` envia `app_name` lido do marcador (sem nome fixo; nome fora de `[A-Za-z0-9-]{1,64}` não é enviado). O pacote embutido no `Ativar-Nextec-<ID>.cmd` acompanha a árvore. **Depois do merge o rdgen precisa ressincronizar `Agente-Senha-Nextec.ps1`.**
- **Testes:** `connect-open.test.mjs` (decisão, esquema por nome, lembrança, detecção, aviso), `connect-abre-direto.spec.mjs` (montagem jsdom de Senhas dos servidores e Acesso rápido), `test_app_name.ps1` (Windows PowerShell 5.1) e testes Go com `-race` do patch 0036.

## 2.11.19

Correção urgente do `Ativar-Nextec-<ID>.cmd` do 2.11.18. Vale para os arquivos gerados daqui em diante: gere o arquivo de novo no painel.

- **Barras invertidas perdidas no PowerShell do arquivo:** o gerador montava três literais em string JavaScript comum, e o JavaScript lê `\A` como `A`, `\v` como TAB e `\p` como `p`. O `.cmd` saía com `'NextecAcesso'` (criava `C:\ProgramData\NextecAcesso` em vez de `C:\ProgramData\Nextec\Acesso`) e com `System32WindowsPowerShell<TAB>1.0powershell.exe` (o Windows PowerShell não era encontrado, a ativação terminava em "erro" depois de instalar e o rollback desfazia tudo). Corrigidos `'\ProgramData'`, `'Nextec\Acesso'` e `'System32\WindowsPowerShell\v1.0\powershell.exe'`, agora em `String.raw`. Nenhum outro módulo de `src/nextec` tinha o defeito.
- **Por que os testes não pegaram:** usavam a raiz de dados temporária, trocavam a linha do `$root` ou usavam dublês, então o caminho padrão nunca era exercitado. Teste novo `nextec/testes/ativar-cmd-barras.test.mjs`: (a) gera o `.cmd` pela função pública, sem override, e confere no texto os três literais e a ausência de `NextecAcesso` e de caracteres de controle; (b) compara as barras invertidas do PowerShell gerado com um oráculo `String.raw` e varre a fonte de `src/nextec` atrás de escape inútil (`\A`, `\v`, `\p`...) em string comum; (c) executa o bloco do `.cmd` no Windows PowerShell 5.1 com `ProgramData`, `SystemRoot` e `SystemDrive` apontando para pastas temporárias e prova que a raiz é `<ProgramData>\Nextec\Acesso` e que o `powershell.exe` resolvido existe e roda; (d) falha se alguma suíte passar a usar o override da raiz.
- **Texto do 2.11.18 corrigido:** as notas abaixo escreviam `%ProgramData%NextecAcesso` (barras perdidas); o caminho certo sempre foi `%ProgramData%\Nextec\Acesso`.

## 2.11.18

- **Ativar-Nextec-<ID>.cmd de um clique, sem gerar nem instalar outro app:** o arquivo agora traz dentro de si o pacote do agente (`Coordenar-Agente-Nextec.ps1`, `Provisionar-Agente-Nextec.ps1` e `Agente-Senha-Nextec.ps1`, os mesmos scripts de `nextec/atualizacao`), comprimido (gzip) e em base64, com o SHA-256 de cada script. Antes de gravar qualquer coisa ele descomprime e confere os hashes; se divergirem, para com mensagem clara. Nada é baixado da internet.
- **Instalação segura:** o que faltar ou divergir do pacote embutido (tamanho ou SHA-256: arquivo vazio, truncado, corrompido ou de versão antiga) é gravado em `%ProgramData%\Nextec\Acesso` com ACL SYSTEM + Administradores (herança desligada, arquivo criado com CreateNew, BOM preservado) e a tarefa do coordenador é registrada. Funciona para qualquer nome de app, inclusive RustDesk 1.5.0 sem os scripts novos (como `Client-Nextec-Connect`).
- **Agente antigo ou quebrado é substituído:** se houver `agente-senha.json` ou o `Agente-Senha-Nextec.ps1` do cofre inicial, o .cmd para e desativa a tarefa "Nextec Acesso - Senha", guarda cópia do cadastro em `agente-senha.json.antigo-<data>` e chama o Coordenar com o novo `-SubstituirAgenteAntigo`. Só o .cmd baixado do painel por administrador autenticado (15 minutos, amarrado ao ID e uuid) usa o parâmetro. O Coordenar tira o cadastro antigo do caminho apenas se estiver em formato ilegível, for de outro ID ou o painel recusar o token (HTTP 401); token reconhecido ou painel sem resposta mantém tudo e o fluxo normal continua recusando cadastro duplicado.
- **Confirmação e log:** depois de entregar a autorização o .cmd aciona o coordenador e espera o cadastro (até 90 s): "Pronto: máquina ativada" ou erro claro, sem expor token nem código. O detalhe vai para `ativar.log` em `%ProgramData%\Nextec\Acesso`, sem segredos. O arquivo se apaga ao terminar com sucesso.
- **Nada de alteração persistente com ativação negada (preflight e rollback):** antes de gravar qualquer arquivo em ProgramData, parar ou registrar tarefa, o .cmd faz uma checagem só de leitura: prazo de 15 minutos, administrador, pacote embutido (hash), formato e tamanho do NXDATA, painel igual ao do marcador local, ativação já pendente e, principalmente, o ID e o uuid da autorização contra os da máquina (serviço instalado do RustDesk, `--get-id` e MachineGuid, as mesmas funções que o Provisionar usa, lidas do pacote embutido). Arquivo de outra máquina para na hora com "este arquivo é de outra máquina" e sem alterar nada. Depois do preflight, tudo o que a execução cria ou muda é rastreado (fotografia da pasta de dados, XML da tarefa do coordenador, estado da tarefa de senha) e, se o coordenador ou o painel recusar (identity_conflict, pending_authorization, invalid_*, 401, 409, painel fora do ar, exceção qualquer), o .cmd desfaz: remove scripts, backups, marcador e tarefa criados, reativa a tarefa de senha, recoloca o cadastro antigo byte a byte e a tarefa do coordenador como era. Só o sucesso deixa alterações; o único rastro de uma falha é o `ativar.log` (sem segredos). Rodar de novo com autorização já usada também não deixa nada. Testes novos em `nextec/testes/ativar-cmd-atomicidade.test.mjs` (PowerShell 5.1, raiz de dados temporária e dublês de tarefas, identidade local, coordenador e painel).
- **Painel:** o botão da tela Senhas dos servidores monta o pacote no navegador (scripts importados no build, `?raw`). O workflow da imagem deixou de ignorar `nextec/atualizacao/**`, porque esses scripts agora fazem parte do build. **Depois do merge o rdgen precisa ressincronizar `Coordenar-Agente-Nextec.ps1` e `Provisionar-Agente-Nextec.ps1`.**
- **Pacote embutido sempre igual à árvore (revisão do PR):** o pacote do agente é montado dos scripts atuais de `nextec/atualizacao`, o gerador confere o conteúdo embutido byte a byte contra o texto importado e contra o SHA-256 lido do disco no build (`vite-plugin-agent-package.mjs`); divergência impede a geração do arquivo. Teste novo falha se o pacote embutido diferir dos scripts do repositório ou se o fluxo passar a exigir um script que não está no pacote.
- **Layout real do Windows no preflight e no agente:** ID, uuid e painel são lidos com o serviço rodando como LocalSystem ou LocalService e a configuração em `C:\Windows\ServiceProfiles\LocalService\AppData\Roaming\<App>\config` (e, em instalação antiga, em `System32\config\systemprofile`), usando os scripts embutidos que já enxergam esse perfil.
- **Script existente que diverge é substituído de forma atômica:** antes, qualquer arquivo com o nome certo e o texto do recurso novo era mantido, mesmo truncado ou vazio. Agora tamanho e SHA-256 são comparados com o embutido; divergente é gravado em temporário na mesma pasta (ACL protegida), relido e conferido, o anterior vira cópia `.antigo-<data>` e só então há a troca. Falha ou interrupção deixa o anterior intacto e sem temporário; o rollback do preflight continua restaurando os bytes originais. Idêntico não é regravado.

## 2.11.17

Achados da revisão do PR do instalador (rdgen #45). Nenhuma mudança de tela; vale para os próximos instaladores gerados.

- **Reinstalação com outro painel:** o instalador sem inscrição de outro painel não herda mais a inscrição nem a credencial do painel anterior (comparação pelo host normalizado, ignorando caixa, porta padrão e barra final); a credencial de outro painel vai para `agente-senha.json.anterior` e o agente nunca a envia ao painel novo. A decisão fica no `coordenador.log`, sem segredos.
- **Painel do instalador no registro:** além de `nextec-marker.json`, o painel do build é lido do valor `Painel` em `HKLM\SOFTWARE\Nextec\Agente` (https validado), depois dos arquivos e antes do padrão.
- **Atualizador:** o `-UrlBase` definido no build é preservado; o painel da inscrição só é usado quando nenhum `-UrlBase` é dado.
- **Tarefa de senha:** só vale com SYSTEM (`S-1-5-18`) e RunLevel Highest, uma única ação com o Windows PowerShell 5.1, `-File` do script esperado com `-Executar` e gatilho periódico de no máximo 5 minutos; qualquer divergência registra a tarefa de novo.
- **Teste de integração do 401:** o agente real contra um painel falso local (HTTP) recebe 401 três vezes seguidas, descarta a credencial e refaz o cadastro; 1 ou 2 respostas 401 não descartam.
- **Pendente do painel anterior não bloqueia mais a inscrição:** o cadastro pendente (journal) e o estado de inscrição própria registram o host normalizado do painel em que foram criados. Se o painel atual (marcador, `inscricao.json` ou registro) for outro, o pendente é descartado (só o código vai ao `coordenador.log`) e a inscrição recomeça no painel atual; no mesmo painel a espera continua, mas expira (autorização em 15 minutos, recusa manual em 24 horas) e a máquina se inscreve de novo. Antes o fluxo respondia `identity_conflict` para sempre.

## 2.11.16

Estabilização do agente no cliente (Fase 1). Nenhuma mudança de tela; vale para os próximos instaladores gerados.

- **Corrigido, o agente não achava o serviço do RustDesk em máquina real:** o serviço roda como LocalSystem, mas o RustDesk grava a configuração em `C:\Windows\ServiceProfiles\LocalService` (o `hbb_common` troca `system32\config\systemprofile` por `ServiceProfiles\LocalService`). O agente procurava em `systemprofile`, não achava nada e nenhuma máquina se inscrevia. Agora olha as duas pastas, e o marcador do instalador (`HKLM\SOFTWARE\Nextec\Agente`, pasta de instalação) identifica o serviço mesmo antes de existir configuração. Entradas de serviço quebradas são ignoradas.
- **Agente antigo com credencial morta se recupera sozinho:** 3 respostas 401 seguidas guardam a credencial em `agente-senha.json.anterior` e o cadastro é refeito automaticamente (antes: 401 a cada 5 minutos para sempre, bloqueando o cadastro novo).
- **Sem becos sem saída no cadastro:** credencial ilegível ou de outro ID (app reinstalado) vai para `.anterior` e a inscrição recomeça; autorização do painel substitui a credencial velha; autorização inválida ou de outra máquina é descartada em vez de travar as próximas; recusa 401/409 da inscrição tenta de novo a cada 6 horas em vez de parar para sempre.
- **Instalação por cima de agente antigo:** arquivo do agente anterior com permissão fora do padrão é apagado e copiado de novo (antes: `unsafe_path` e o MSI desfazia a instalação inteira). Erros do coordenador vão para `coordenador.log`.
- **Menos ruído:** a tarefa de senha só é recriada quando falta (antes: a cada 5 minutos). O atualizador volta a aceitar `-PacoteVersao`, que o MSI do gerador envia.
- **Corrigido, a troca de senha nunca era confirmada em máquina real:** o `rustdesk.exe` é um programa de janela (subsistema GUI) e `$x = & exe args` do PowerShell não espera nem captura a saída de um programa assim (o `--password` rodava sem ninguém conferir o "Done!" e o agente acusava "não confirmou a aplicação"). O agente passa a iniciar o cliente com a saída redirecionada, esperar com limite de 60 s e usar o código de saída real. Teste com um executável GUI de verdade.
- **Erro de aplicação de senha com diagnóstico:** `password_apply_failed` agora traz a resposta do cliente (uma linha curta; por exemplo, "Installation and administrative privileges required!").
- **Revisão do PR:** a credencial existente só vai para `.anterior` depois de o servidor aceitar o cadastro novo (autorização vencida, recusa ou falha de rede não deixam a máquina sem a configuração que já tinha); o contador de recusas conta só 401 **seguidos** (503, rede ou timeout zeram); a tarefa de senha só vale com conta SYSTEM, `powershell.exe` do sistema, o script da pasta de dados com `-Executar` e repetição de 5 minutos, senão é recriada; o painel do instalador (`nextec-marker.json`, campo `painel`) vai para a pasta de dados e é lido mesmo sem `inscricao.json`; instalador sem `inscricao.json` não herda a de outro painel.

## 2.11.15

- **Corrigido, Ativar-Nextec-<ID>.cmd parava em servidor real:** um programa qualquer com `InstallLocation` entre aspas no registro (`"C:\Program Files\X\"`) derrubava o script com "Cannot find drive '"C'". Agora todo caminho vindo de fora (registro de desinstalação 64/32 bits, marcador, serviços, tarefas agendadas, Program Files) passa por uma normalização única: tira espaços e aspas, expande `%VAR%`, remove barra final repetida e só aceita caminho local `X:\` válido. Entrada ruim (UNC, caractere inválido, variável sem valor) é ignorada e anotada; a busca continua e o agente é achado mesmo depois de várias entradas ruins.
- **App instalado sem o agente é reconhecido:** pasta com o RustDesk (entrada de desinstalação, serviço `--service` ou Program Files) preenche o nome do app e a mensagem passa a ser "gere com o MESMO nome do app e instale por cima". Havendo serviço, vale só o app com serviço (o de suporte avulso não instala serviço); sem serviço, lista os encontrados.
- **Mensagem curta:** a lista do que foi procurado não repete caminhos, mostra no máximo 5 na tela ("e outros N") e a lista completa vai para `Ativar-Nextec-<ID>-busca.log` ao lado do `.cmd` (ou no TEMP). Nenhum erro inesperado termina com exceção crua.
- **Testes com dados sujos reais** rodando o PowerShell gerado no 5.1 (novo passo no job Windows do CI): parse do bloco embutido, tabela de casos sujos, leitura real da máquina e fumaça do `.cmd` completo.

## 2.11.14

- **Trava de CI contra erros repetidos:** novo `nextec/testes/verificar-integridade.mjs` roda em todo PR e barra patch, `.sh`, Dockerfile ou workflow com CRLF, `.ps1` com acento sem BOM UTF-8 e série de patches fora do padrão. `.gitattributes` passou a forçar LF nesses tipos e em `.mjs`, `.js`, `.vue` e `.json`.
- **Testes de node:** `@vue/compiler-sfc` virou `devDependency` explícita (antes era só transitiva do `vue` e os testes `templates-declarados`, `secrets-view` e `rodape-versao` quebravam sem `npm ci` completo); a verificação acusa o ambiente incompleto com mensagem clara.
- BOM adicionado a `Manifesto-Connect.ps1` e `atualizador-agendamento.ps1` (tinham acento sem BOM). Sem mudança de comportamento do painel.

## 2.11.13

- **Corrigido, excluir item já enviado para Atualizações:** o botão **Excluir** estava escondido nesses itens e a confirmação extra nunca aparecia. Agora o botão aparece em todo item que pode ser excluído; nos já enviados, o diálogo mostra o aviso ("já enviado para Atualizações...") e o botão **Excluir mesmo assim**. Em lote, esses itens entram numa única confirmação que lista quais são. Item em andamento continua sem botão. **O rdgen precisa ser atualizado** (`feat/gerador-simplificado`): ele agora separa "pode excluir" de "exige confirmação".

## 2.11.12

- **Itens gerados, excluir o que não serve:** cada item pronto ou com erro tem o botão **Excluir** (confirmação curta). Há seleção múltipla com **Excluir selecionados** e o botão **Limpar falhas**, que remove de uma vez tudo o que falhou, ficou incompleto ou parou sem terminar.
- **Segurança da exclusão:** itens em andamento não podem ser excluídos; itens que já foram enviados para Atualizações pedem uma confirmação extra (só os arquivos de download saem; a versão preparada no painel não é afetada). O servidor valida o identificador, apaga somente a pasta do próprio item e registra quem excluiu.
- **Formulário do gerador mais simples:** o essencial (plataforma, nome do instalador e do app, cliente, versão do pacote, ícone) fica à frente, com os valores Nextec já aplicados e explicados em uma linha. Servidor, segurança, aparência, permissões e modelos ficam em **Avançado**, recolhido. Erros aparecem no próprio campo. **O rdgen precisa ser atualizado** (`feat/gerador-simplificado`) para a exclusão e o novo formulário.

## 2.11.11

- **API com o mesmo painel da interface:** a autorização individual do agente (`/secrets/bootstrap`) deixou de emitir `painel-remoto.nex.tec.br` fixo. O endereço vem de uma fonte única: `NEXTEC_PANEL_URL` (a stack repassa `URL_PAINEL`), e, se vazia, do domínio acessado (`X-Forwarded-Host/Proto` só de proxy local ou privado). Valor inválido gera erro claro em vez de emitir endereço errado.
- **Validação única:** só `https://dominio`, sem credencial, porta, caminho, consulta ou IP literal, igual ao agente e à interface.
- Patch `0034-painel-url-configuravel.patch` com testes Go (`-race`) e teste de ponta a ponta (resposta da API em `painel.outro.exemplo` aceita pela interface, pelo `.cmd` e pelo provisionador PowerShell 5.1).

## 2.11.10

- **Painel configurável, nada fixo:** os scripts do agente (Windows `.ps1` e Linux `.py` do coordenador) leem o endereço do painel do `inscricao.json` instalado (ou do `nextec-marker.json`), nunca da rede. Trocar de domínio não quebra a frota: o valor do arquivo vence o cadastro antigo e o `-UrlBase` do atualizador.
- **Validação do host:** só `https://dominio`, sem credencial, IP literal, porta, caminho ou consulta; sem redirecionamento. Sem arquivo (instalação antiga), cai no painel padrão e grava aviso no log.
- **Tela de ativação:** o painel esperado passa a ser a origem da própria página, em vez de um valor fixo.
- Novos testes (PowerShell 5.1, Python e node). Pendente: `atualizador-linux.py` e `agente-senha-linux.py` não estão nesta base e precisam do mesmo tratamento; o rdgen deve ressincronizar os scripts e gravar `inscricao.json` com `painel` válido.

## 2.11.8

- **O gerador obtém a credencial de inscrição sozinho:** a cada build o rdgen busca a credencial vigente no painel pela rede interna da stack (`GET /api/nextec/gen/enroll-key`, protegido pelo segredo compartilhado `GERADOR_SH_SECRET` e recusado quando vem pelo túnel da Cloudflare). Não é mais preciso copiar a credencial para `GERADOR_ENROLL_KEY` no Portainer nem refazer o deploy ao girar: o próximo instalador já sai com a nova. `GERADOR_ENROLL_KEY` virou override opcional (usado só se a busca falhar).
- Novo patch de backend `0033-gen-enroll-key.patch` (aplicar sobre a série, com a API v2.6.29). **A imagem da API precisa ser reconstruída**; o rdgen precisa da versão com a busca automática.
- Texto do card "Credencial de inscrição" atualizado: "O gerador usa esta credencial automaticamente". `GERADOR.md` e o cabeçalho da stack também.

## 2.11.7

- **Atribuir em um clique:** quando o cliente ainda não tem senha automática, o diálogo de Atribuir já vem com "Senha automática do cliente (ligar agora)". Ao confirmar, o servidor liga a regra do cliente e atribui a máquina na mesma transação (patch 0032, `enable_group_rule` em `POST /api/admin/nextec/secrets/assign`). Intervalo padrão de 3 horas, idempotente e auditado (`client_rule_enable`). Identidade (UUID), aprovação e anti-lixo continuam conferidos como antes, e uma recusa não deixa regra ligada pela metade. Sem a flag a API segue recusando, como no patch 0031.
- **Próxima verificação à vista:** em Máquinas e Pendentes cada linha mostra "Próxima verificação em ~N min" a partir de `last_seen_at` (ciclo de 5 minutos do agente), com aviso quando atrasa ou fica sem contato. A lista se atualiza sozinha a cada minuto, pausa com a aba oculta e o timer é limpo ao sair da tela.
- Novos testes: backend (`-race`), `agent-cycle`, `assignPayload` e montagem da tela (padrão do diálogo e limpeza do timer). Proposta do botão Assinar com ponte local registrada em `nextec/atualizacao/ASSINATURA.md` (sem implementação).

## 2.11.6

- **Nome do app livre:** o painel não depende mais de nome fixo (Nextec-Connect, XPTO ou qualquer outro). O `Ativar-Nextec-<ID>.cmd` localiza o agente pelo marcador de instalação (`HKLM\SOFTWARE\Nextec\Agente` {InstallDir, AppName} ou `%ProgramData%\Nextec\Acesso\nextec-marker.json`), depois por entrada de desinstalação, serviço RustDesk e varredura limitada, e lista tudo o que procurou.
- **Agente de senha e instalador:** quando há mais de um serviço RustDesk, o `AppName` do marcador escolhe o certo; a mensagem de "nenhum serviço" diz o que foi procurado.
- **Assinatura:** o `ProductName` do MSI é conferido contra o `app_name` do pedido (opcional) em vez de exigir `Nextec-Connect`; o pacote DEB só precisa de nome válido.
- Novos testes com `XPTO`, `Nextec-Connect` e `Client-Nextec-Connect` (PowerShell 5.1, node e Python). **O rdgen precisa gravar o marcador** (`HKLM\SOFTWARE\Nextec\Agente` e/ou `nextec-marker.json`) e pode enviar `app_name` no pedido.

## 2.11.5

- **Corrigido, "O agente Nextec não está instalado" em app com outro nome:** o `Ativar-Nextec-<ID>.cmd` agora localiza o agente sem depender do nome do app (pasta `%ProgramData%\Nextec\Acesso`, entrada de desinstalação com "Nextec-Connect", tarefa agendada Nextec e varredura de `%ProgramFiles%\*Nextec*`). Se achar os scripts na pasta do app, registra o coordenador sozinho.
- **Mensagem precisa:** quando o app existe mas não traz o agente (ex.: `Client-Nextec-Connect`), o arquivo diz isso, mostra onde procurou e orienta gerar o instalador com o MESMO nome do app e instalar por cima (ID e cliente se mantêm).
- Novos testes no PowerShell 5.1 simulando `Client-Nextec-Connect`. **O rdgen também precisa de correção:** o `build-msi.ps1` só inclui o agente quando o nome do app é exatamente `Nextec-Connect`.

## 2.11.4

- **Fluxo guiado em "Senhas dos servidores":** cada máquina mostra em que etapa está (1 Cliente, 2 Agente, 3 Senha automática) e tem um único botão de próximo passo: Escolher cliente, Instalar agente, Ligar senha automática ou Conectar.
- **Escolher cliente na própria tela:** diálogo curto com busca e "Criar cliente" no lugar, que já segue para a próxima etapa. Pendentes usam a atribuição do cofre (aprovação, identidade e regra continuam conferidas no servidor); máquinas já aprovadas sem cliente usam a mesma rota de "Mover para um cliente" de Dispositivos.
- **Topo mais simples:** um aviso com o estado geral e um único botão contextual ("Você tem 2 máquinas sem cliente. Escolher cliente"), mais um bloco recolhível "Como funciona" em 3 passos. Regras, Auditoria, Credencial de inscrição e Autorização individual ficaram no menu "Mais".
- **Instalar agente com um arquivo só:** o painel baixa `Ativar-Nextec-<ID>.cmd`. Basta copiar para o servidor e dar duplo clique como administrador: ele confere o prazo de 15 minutos e o ID da máquina, entrega a autorização ao agente já instalado, apaga o temporário e mostra "Pronto: máquina ativada. Pode fechar." ou o erro em português. Sem diálogo de arquivo e sem "assistente local".
- A lista da Autorização individual mostra todas as máquinas; as sem cliente aparecem com selo e levam a "Escolher cliente agora". O estado vazio explica o que fazer.
- Script do painel `Coordenar-Agente-Nextec.ps1`: novo parâmetro `-ArquivoAutorizacao` (usado com `-Receber`, sem diálogo; o arquivo é apagado ao final). **O rdgen precisa ressincronizar os scripts vendored.**
- Novos testes: `secrets-flow`, `activation-cmd`, montagem da tela nos quatro estados e o teste do coordenador.

## 2.11.3

- **Corrigido, instalador gerado sem a chave de inscrição:** a stack do Portainer não repassava `NX_ENROLL_KEY` ao serviço do gerador. Agora a variável `GERADOR_ENROLL_KEY` (credencial do card "Credencial de inscrição") é repassada. Defina-a no Portainer, faça Pull and redeploy e gere um instalador novo; os antigos não têm a chave. Passo a passo em `nextec/deploy/GERADOR.md`.

## 2.11.2

- **Corrigido, tela quebrava ao voltar de "Senhas dos servidores" para outra:** o guarda de erro dessa tela tinha como raiz um slot, e o efeito de transição do conteúdo (entrada só depois da saída) não concluía a saída de uma raiz sem elemento. A tela seguinte nunca entrava e só o F5 resolvia. O guarda agora tem um elemento único na raiz e zera o estado de erro ao trocar de tela.
- **Corrigido, rodapé com a versão coberto pelo menu:** a versão ("Painel v2.11.2" e `master-<commit>`) agora é uma barra fixa no fundo do menu lateral, fora da área que rola, nos temas claro e escuro, com o menu aberto ou recolhido.
- Corrigida a coluna do dispositivo no log de login, que lia um nome inexistente no template.
- Novos testes no CI: navegação real entre as telas (A, B, A, C, sem erro nem tela vazia), verificação de nomes do template de todas as telas Nextec e do layout do rodapé.

## 2.11.1

- **Corrigido, tela "Senhas dos servidores" abria em branco:** a tela usava `blockedDlg` (diálogo "Bloqueadas") sem declará-lo, o que derrubava a renderização inteira. Agora o diálogo existe e abre normalmente.
- A tela passou a ter proteção contra falha de renderização: se algo der errado ao montar, aparece o aviso "Não foi possível montar esta tela" com botão Recarregar, em vez de uma página vazia. Respostas da API com lista nula ou campos ausentes também são normalizadas.
- Novo teste de regressão (compila o template e) que falha se o template usar um nome que o script não declara.

## 2.11.0

- **Inscrição global de máquinas:** o instalador passa a ser o mesmo para todos os clientes. A máquina se inscreve sozinha como pendente, sem senha e sem acesso. Em **Senhas dos servidores > Pendentes** você atribui a máquina a um cliente (regra do cliente, regra só da máquina ou sem regra) e só então o cofre gera e libera a senha.
- Rejeitar remove a inscrição; Bloquear impede a máquina de voltar (há uma lista de bloqueadas com Desbloquear).
- **A regra escolhida vale exatamente:** "regra do cliente" apaga qualquer regra própria anterior da máquina e exige regra ligada no cliente (sem ela, nada é aprovado nem movido); "regra da máquina" valida o intervalo (15 minutos a 24 horas, nunca 0 nem negativo); "sem regra" aprova sem rotação e não herda a regra do cliente. Repetir o mesmo pedido não muda nada; pedir outra regra para a mesma máquina atualiza e fica na auditoria. Tudo em uma transação.
- **Identidade conferida:** o UUID gravado na inscrição é comparado com o da máquina ao atribuir, rejeitar, sincronizar e entregar senha. Se divergir, o painel recusa (código 101, com a explicação), o agente recebe 409 `identity_conflict`, nenhuma senha é entregue e a recusa fica na auditoria, sem segredos.
- **Credencial de inscrição:** card para ver, copiar e girar a credencial que vai no instalador. Girar invalida instaladores antigos para inscrições novas. As pendentes feitas com a credencial anterior continuam na aba Pendentes com o selo "Chave anterior" e podem ser atribuídas, rejeitadas ou bloqueadas; se o agente reenviar a inscrição com a credencial nova, a mesma linha é atualizada sem duplicar. Máquinas já atribuídas não são afetadas.
- A autorização individual de 15 minutos continua como contingência. Máquinas existentes permanecem aprovadas, sem migração.
- API (patch 0031): endpoint `self-enroll`, limites de inscrição por IP, total e de pendentes, e rotas de atribuição, rejeição, bloqueio e credencial no admin.

## 2.10.6

- **Corrigido, regravação do journal e do estado do agente no Windows PowerShell 5.1:** `[IO.File]::Replace` recebia `$null` no caminho de backup, que o 5.1 converte em texto vazio e lança "The path is not of a legal form" quando o arquivo já existia. Afetava `Provisionar-Agente-Nextec.ps1` e `Agente-Senha-Nextec.ps1`; agora usam `[NullString]::Value`. Novo teste de regressão `test_atomic_replace.ps1`, incluído no CI.

## 2.10.5

- **Gerar cliente, tela reorganizada:** abre em Novo instalador; as etapas Gerar, Conferir e Atualizar destacam onde você está; o guia "O que preencher" (você escolhe, deixe em branco, já vem travado) fica acima do formulário; o protocolo do botão Conectar passa para um bloco Avançado recolhido.
- **Itens gerados:** cada item mostra situação, plataforma e data em destaque, downloads MSI e EXE como ações secundárias e "Enviar para Atualizações" como ação principal; versões e nome do arquivo ficam discretos. Estados de carregando, vazio (com atalho para Novo instalador), erro (com tentar novamente), progresso e falha com orientação.
- Sem mudança de API, rotas ou comunicação com o gerador.

## 2.10.4

- **Assinar versão em um comando:** `nextec/atualizacao/assinador/Assinar-Versao.ps1` obtém o pedido da versão pendente no painel, confere hash, produto e versão, pede a senha da chave só na janela local, assina e envia manifesto e assinatura. Sem baixar nem subir arquivos à mão.
- Guia curto em `nextec/atualizacao/ASSINATURA.md`, com o caminho da chave local e os testes que não usam a chave real.
- Corrigido: caminhos com acentos (chave, pasta do assinador, saída e temp) não impedem mais o envio da assinatura; o assinador agora devolve o caminho em UTF-8. Há teste de regressão.

## 2.10.3

- Painel aberto durante uma atualização recarrega sozinho uma vez, com aviso, em vez de falhar ao abrir a tela. Se o navegador bloquear o armazenamento, não recarrega sozinho (evita loop) e mostra o aviso com botão Recarregar.

## 2.10.2

- **Senhas dos servidores:** aviso explica que o agente de senha só é cadastrado após autorização individual temporária; máquinas sem agente aparecem como "Agente não cadastrado", com orientação para cadastrar.
- Documentação da atualização e dos testes passa a descrever a tarefa agendada do atualizador, já registrada pelo MSI 2.0.9.

## 2.10.1

- Cabeçalho compacto em tablets: os botões não cobrem o título da página.

## 2.10.0

- **Gerar cliente > Itens gerados:** histórico persistente, versões do pacote e da base RustDesk, carteira, downloads e progresso aproximado por etapas dentro do painel.
- **Enviar para Atualizações:** transfere o MSI do gerador com validação de tamanho e SHA-256. A publicação automática continua exigindo manifesto assinado.
- Publicações específicas por cliente ou máquina preservam a versão geral. Pacotes específicos não podem virar o download geral dos analistas.
- O administrador pode disponibilizar uma versão aos analistas. O botão Conectar oferece baixar o aplicativo.
- Máquinas sem checagem são indicadas como pendentes; telas de atualização usam cartões em tablets.
- O gerador 2.0.7 oferece executar o EXE sem instalar ou instalar com checagem diária. Instalação e reparo do MSI foram testados na CI com Windows Server 2022.

## 2.9.9

- Atualizações do app recebem autorização por manifesto assinado com a chave RSA do monitoramento Nextec. O painel valida se o manifesto corresponde ao MSI enviado antes de publicar.
- O novo script de atualização valida assinatura, produto, vencimento, sequência, tamanho e hash do MSI. Releases sem autorização válida ficam aguardando no painel.
- O atualizador protege sua pasta contra escrita por usuários comuns antes de registrar a tarefa SYSTEM. A instalação dentro dos pacotes EXE/MSI e a migração de instalações antigas continuam pendentes de teste Windows.

## 2.9.8

- **Segurança > Logins ativos:** mostra pessoa, origem, plataforma, IP e IDs do dispositivo quando o app os informa. Encerrar sessão revoga a credencial imediatamente.
- A listagem mostra apenas logins válidos e não envia os tokens secretos ao navegador. Logins antigos podem não ter origem e IP registrados.

## 2.9.7

- A configuracao do cliente web usa URL versionada para evitar cache de um endereco WebSocket antigo.
- A stack garante leitura da chave publica pelo RDGen e restringe a chave privada ao root.

## 2.9.6

- Cliente web usa WebSocket seguro no mesmo dominio HTTPS do painel, com proxy interno para hbbs/hbbr.
- Testes verificam transporte bidirecional e bloqueio de origens externas; credenciais do painel nao sao encaminhadas.

## 2.9.5

- **Botão Conectar com o app gerado:** o app gerado como `Nextec-Connect` registra o protocolo `nextec-connect://`, e o painel abria `rustdesk://` (o Windows pedia para "obter um aplicativo"). Em Dispositivos > Gerar cliente, o administrador define o protocolo do app instalado; o botão Conectar passa a usá-lo.

## 2.9.4

- **Permissões de acesso:** senhas automáticas respeitam o vínculo da máquina com o cliente e os acessos liberados pelo administrador. Favoritos continuam permitindo conexão manual.
- **Ajustes do servidor:** comandos exigem conta de administrador.
- **Cadastro de dispositivos:** validação do vínculo da máquina e proteção contra troca indevida do responsável.

## 2.9.3

- **Gerar cliente:** novo item no menu Dispositivos (só administradores) que abre o gerador de instaladores já configurado com o servidor, a chave e a identidade da Nextec.
- O gerador só aceita administradores e pessoas autorizadas (lista de e-mails, além do login do Cloudflare Access).

## 2.9.2

- **Ajustes do servidor voltam a funcionar** com o servidor de ID e o relay em contêiner separado: relay, velocidade, IPs bloqueados, uso e login obrigatório. O painel agora fala com um encaminhador ao lado do hbbs/hbbr, que repassa os comandos pelo endereço local que eles exigem.
- Comandos de gravação (por exemplo "sempre usar relay") deixaram de ficar esperando resposta.

## 2.9.1

- **Avisos de erro em português e claros:** em vez de frases técnicas ("dial tcp 127.0.0.1:21117: connection refused", "Network Error"), o painel diz o que aconteceu e o que fazer.
- **Ajustes do servidor:** deixou de mostrar um aviso vermelho por comando quando o servidor de ID e o relay não respondem. A tela mostra "Sem resposta" e uma explicação única.

## 2.9.0

- **ID com máscara:** em todo o painel o ID aparece em grupos de três (`268 304 385`), como no app. Ao copiar, enviar ou salvar, vai sempre sem espaços (`268304385`). Nos campos de ID você pode digitar com ou sem espaços.
- **IDs com espaço que já estavam gravados** (por exemplo `536 822 159`) são corrigidos sozinhos quando o painel inicia, se não houver conflito com outro ID.
- Gerador de clientes (rdgen): recusa a porta 21117 a 21119 no campo de porta do servidor de ID. Um app gerado com 21117 fica em "Não está pronto" porque registra no relay.

## 2.8.0

- **Celular:** as tabelas do painel (Usuários, Equipes, Logins, Dispositivos, Clientes e as demais) viram **cartões**, com rótulo em cada campo e os botões de ação à vista, sem precisar rolar para o lado. No computador nada muda.
- Chips de e-mail e nomes longos nas tabelas deixaram de estourar a coluna.
- Topo no celular: o título da página cabe inteiro.
- **Suporte avulso** agora fica também em Minha área para todos os usuários: link de suporte com Copiar link e Copiar mensagem, mais a fila. Enviar o aplicativo e escolher quem vê a fila continuam só com administradores.
- Textos de envio do aplicativo e do instalador não citam mais o rdgen.
- Minhas listas: o aviso da lista padrão virou texto discreto, sem bloco colorido.

## 2.7.1

- Telas Suporte avulso, Atualizações do app, Políticas do app, Conexões ativas e Relatório mensal agora ocupam a largura toda, alinhadas com o topo, e os estados vazios ganharam espaçamento.
- Minhas listas: o aviso sobre a lista padrão deixou de ser um bloco vermelho e a lista padrão mostra que é fixa.
- Suporte avulso: com o app ainda não enviado, a fila mostra só o aviso (sem a mensagem de "ninguém aguardando").

## 2.7.0

- **Quem vê a fila Aguardando atendimento** agora é uma opção (Dispositivos > Suporte avulso): desligada, só administradores (padrão) ou todos os usuários. A regra vale no servidor: quem não pode ver não recebe nem os dados.
- **Agrupar por cliente** em Dispositivos: a lista vira seções por cliente, com o total de máquinas e quantas estão online em cada uma.
- Revisão no celular de todas as telas do painel: sem rolagem lateral.

## 2.6.0

- **Relatório mensal** (Auditoria): acessos do mês por cliente, com tempo total, máquinas, técnico e chamado. Exporta em CSV (abre no Excel) e imprime ou salva em PDF.
- **Chamado na conexão**: ligue em Relatório mensal > Chamado na conexão. Ao clicar em Conectar, o técnico informa o número do chamado (opcional ou obrigatório) e ele vai para o relatório, com link para o Jira.

## 2.5.0

- **Instalar por cliente:** em Dispositivos > Clientes, o menu de cada cliente ganhou **Comando de instalação**. Quem roda o comando instala o app e a máquina já entra no cliente certo. Dá para invalidar todos os comandos antigos.
- **Políticas do app** (Segurança): defina por cliente (e subgrupos) ou por máquina o que o RustDesk permite: transferência de arquivos, área de transferência, terminal, teclado e mouse, áudio, túnel, reinício, gravação e mais. O app aplica sozinho em segundos. Nada muda enquanto não houver regra ligada.
- **Conexões ativas** (Segurança): veja quem está conectado agora em cada máquina e derrube a sessão com um clique.
- A tela antiga "Sessões ativas" passou a se chamar **Logins no painel**, para não confundir.

## 2.4.0

- **Suporte avulso** (Dispositivos > Suporte avulso): link público `/suporte` para o cliente baixar o app de suporte sem ter nada instalado. O administrador envia o app (.exe do rdgen) uma vez e pode tirá-lo do ar quando quiser.
- Nova lista **Aguardando atendimento** no Início e na tela de suporte: quem abre o app aparece na hora, com o botão Conectar. Botões para copiar o link e uma mensagem pronta.
- O envio de arquivos grandes passou a usar o mesmo componente, com barra de progresso.

## 2.3.0

- Nova tela **Dispositivos > Atualizações do app**: envie o instalador (MSI do rdgen), publique primeiro para um grupo piloto e depois para todos, volte para uma versão anterior ou suspenda.
- Acompanhe quais máquinas já estão na versão publicada e quais aguardam.
- O script `Instalar-Nextec.ps1` agora busca a atualização no próprio painel (sem precisar do site no R2) e informa o ID da máquina, para o piloto funcionar.
- Celular: o título da página não é mais coberto pelos ícones do topo e as listas de atualizações viram cartões.

## 2.2.0

- Início: novo bloco **Acesso rápido**, com Favoritos e Recentes. Conecte em uma máquina com um clique.
- Dispositivos: estrela para favoritar, filtro Favoritos e ordenação (online primeiro, visto há menos tempo, cliente, nome).
- Dispositivos: **Ver detalhes** abre a ficha da máquina (sistema, processador, memória, versão do app, último IP).
- Dispositivos: **Mover para um cliente** em vários dispositivos de uma vez.
- Favoritos e recentes ficam guardados neste navegador, por usuário.

## 2.1.0

- Tema escuro novo, em grafite (sem o azul), com o roxo da Nextec só como destaque.
- Números do painel (Início) agora têm um zero legível, sem parecer a letra O.
- Barra de filtros de Dispositivos cabe em uma linha em telas de notebook.

## 2.0.1

- Versão do painel passa a ser numerada (`2.0.1`), com a lista de novidades dentro do painel.
- Conectar: IDs com espaços (`536 822 159`) agora abrem a conexão corretamente.
- Conectar: o clique não é mais bloqueado pelo navegador.

## 2.0.0

Base atual em produção.

- Cofre de senhas: troca automática da senha do RustDesk nos servidores, com botão Conectar sem digitar nada.
- Clientes com subgrupos em lote e modelos de cliente.
- Login com Microsoft e foto de perfil.
- Servidor RustDesk em contêiner separado do painel: atualizar o painel não derruba o acesso remoto.
