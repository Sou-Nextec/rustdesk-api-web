# Novidades do painel Nextec

Cada versão segue o padrão `maior.menor.correção`. Esta página aparece no painel em **Novidades** (menu do usuário).

## 2.11.52

Requisito do instalador à vista no convite.

- **Por que o convite não vinculava a máquina:** o instalador (MSI) só entrega o código do convite ao agente se foi gerado pelo gerador **2.3.11 ou mais novo**. Quem instala com um MSI mais antigo entra como **Pendente**, sem cliente, e o convite fica com 0 usos.
- **Convite de instalação** agora mostra, junto da versão publicada para todos, o requisito: o instalador precisa ser do gerador 2.3.11 ou mais novo para vincular sozinho (a versão da release é o número que você escolhe ao publicar e pode não coincidir com a do gerador, então o painel não tenta adivinhar). O convite fica preso à versão que estava publicada quando foi criado.

## 2.11.50

Lista de dispositivos mais fácil de ler.

- **Cor por cliente:** cada cliente tem o seu tom na coluna Cliente (subclientes herdam o do cliente). Os dez primeiros clientes nunca repetem cor, nos temas claro e escuro, com contraste de leitura.
- **Nome do computador em maiúsculas** na lista e na ficha, para ficar padronizado. É só a exibição: o nome gravado, a busca e a exportação continuam como a máquina informou.

## 2.11.49

Diálogo de convite que não cabia na tela e aviso "Abrindo o aplicativo".

- **Convite de instalação:** quando o convite criado deixava o diálogo mais alto que a janela, o título e o X saíam da tela e não dava para fechar. Agora só o **corpo rola**, com o título e o X sempre à vista.
- **Avisos de andamento** ("Abrindo o Nextec Connect...", "Baixando Nextec Connect..."): deixam de ser a caixa cinza com "i", que parecia erro. Passam a usar o lilás da marca com um ícone girando e o link em roxo.

## 2.11.48

Suporte rápido mais simples e máquina offline não é "agente parado".

- **Suporte rápido:** sai o campo de cliente ou chamado da frente (fica em "Opções", junto com a validade). A tela mostra só o **código do atendimento**; ao clicar em **Gerar link** o link já é **copiado para a área de transferência** e a tela avisa.
- **Código diferente do ID do RustDesk:** seis dígitos com hífen (`482-913`), para não confundir com o ID de nove dígitos da máquina. A página que o cliente abre mostra esse código em destaque.
- **Página do cliente:** o código mostrado vem do rótulo do link (patch 0043); link criado pelo formulário antigo, sem código, mostra o rótulo inteiro.
- **Senhas dos servidores:** quando o agente fica sem contato **e a própria máquina também está offline** (o servidor do RustDesk não a vê há mais de 3 minutos), a tela diz "Máquina offline há X. Desligada ou sem internet; o agente volta sozinho; não precisa reinstalar" em vez de mandar reinstalar o agente. Máquina online com agente quieto continua como "agente parado". O resumo do topo conta as offline à parte.

## 2.11.47

Adicionar e Conectar viram menus; Suporte rápido sem digitar.

- **Adicionar** (Dispositivos) agora abre um menu: **Suporte rápido**, **Convite de instalação** e **Cadastrar pelo ID**; cada opção abre a sua própria tela, sempre do mesmo tamanho.
- **Conectar** (topo) também é um menu: **Suporte rápido** e **Conectar pelo ID**. O Suporte rápido deixou de fechar sozinho ao gerar o link.
- **Suporte rápido sem digitar:** a tela já mostra um **ID do atendimento** aleatório (como `482 913 076`); basta clicar em **Gerar link**. O texto de cliente ou chamado é opcional e o ID vai junto no rótulo.
- **Convite de instalação:** o padrão passou a ser **um link por cliente para várias máquinas**; a descrição ficou opcional (sem ela vale o apelido e, sem apelido, o nome do cliente). A aba "Em lote" saiu da tela. Ajuste no patch 0041.

## 2.11.46

Ajustes do servidor que não ficavam salvos.

- **Causa:** "Sempre usar relay" e "Exigir login no app" mudam o hbbs em execução; quando a stack é reimplantada ou o servidor reinicia, ele volta ao que está escrito na stack (que fixava `MUST_LOGIN=N` e não tinha `ALWAYS_USE_RELAY`).
- **Correção:** a stack agora lê `ALWAYS_USE_RELAY` e `MUST_LOGIN` das variáveis do Portainer (padrão `N`). Defina `Y` na stack e faça Pull and redeploy para manter depois de reiniciar.
- A tela explica isso embaixo de cada opção.

## 2.11.45

Links no domínio de suporte (instalador e atendimento).

- **Novos endereços:** `<domínio>/instalador/<código>` (convite de instalação) e `<domínio>/atendimento/<código>` (suporte rápido). Os links antigos (`/i/` e `/s/`) continuam funcionando.
- **Domínio configurável no painel:** em **Suporte avulso > Endereço dos links** o administrador define o domínio (ex.: `https://suporte.nex.tec.br`) e pode trocar quando quiser. Em branco, vale o endereço em que o painel está aberto. Só `https://dominio` é aceito (sem porta, caminho ou parâmetros). Links, mensagens, CSV do lote e o comando PowerShell passam a sair com esse domínio. Patch 0042.
- **Proxy/Cloudflare:** o domínio precisa encaminhar só `/instalador/*` e `/atendimento/*` ao painel; o resto continua no portal de suporte.
- **Falha ao carregar o endereço:** se a consulta falhar, copiar link e salvar ficam bloqueados (com "Tentar de novo") em vez de usar o endereço do painel ou apagar o valor salvo.
- As páginas públicas passam a baixar por endereço relativo, então funcionam em qualquer domínio.

## 2.11.44

Convites de instalação (segunda parte: o agente).

- **O agente lê o código do convite.** Quando o MSI baixado de um link `/i/<código>` é instalado, o coordenador tira o código do nome do arquivo e o guarda em `convite.json` (só administradores e SYSTEM leem). Depois da inscrição, a máquina apresenta o código ao painel com a própria credencial e entra direto no cliente do convite.
- **Segurança:** só o código de 20 caracteres sai do nome; nome sem código ou renomeado não grava nada (a máquina entra como Pendente, como antes). Resposta definitiva do painel (aceito, inválido, vencido, conflito) apaga o arquivo; falha temporária tenta de novo por até 3 dias.
- **Ainda falta:** o instalador (MSI) passar o caminho do próprio arquivo ao agente (mudança no gerador de clientes).

## 2.11.43

Convites de instalação (primeira parte: painel e servidor).

- **Adicionar** (Dispositivos) agora abre uma janela com **Convite de instalação**, **Em lote**, **Suporte rápido** e **Pelo ID** (o cadastro manual de antes).
- **Convite de instalação:** escolha o cliente, apelido, tipo (servidor ou estação), senha automática (com o intervalo), uso (uma máquina ou link do cliente com limite) e validade (8 h a 7 dias). O painel gera o **link** `/i/<código>` (o cliente baixa o MSI e instala como qualquer programa) e o **comando PowerShell silencioso** (confere o SHA-256 escrito nele). O MSI sai com o código no nome do arquivo.
- **Em lote:** uma linha por máquina (`apelido; descrição`), um convite de uso único por linha, tudo ou nada, com CSV de links e comandos.
- **Lista de convites** com situação (ativo, usado, vencido, cancelado), usos, copiar link e comando, e cancelar. Convites vencidos há mais de 7 dias somem da lista.
- **Segurança:** código de 20 caracteres (só o hash é consultado), validade máxima de 7 dias, limite de usos, cancelamento, auditoria; sem senha em link ou comando. Patch 0041.
- **Versão fixada no convite:** o convite entrega o MSI que estava publicado para todos quando foi criado; publicar outra versão depois não quebra o comando já copiado (o hash é o da versão do convite). Só versão publicada para **todos** gera convite (piloto não).
- **Segurança do consumo:** a vaga é gasta numa transação, com registro único por convite e máquina; repetir ou reenviar não consome outra vaga. Limite por máquina do agente responde 429 com Retry-After.
- **Diálogo:** retirar a publicação com o diálogo aberto não derruba mais a tela (o comando usa a versão do convite).
- **Ainda não vale ponta a ponta:** a máquina só entra sozinha no cliente depois que o agente e o MSI passarem a ler o código do nome do arquivo (próximas etapas). Até lá o convite instala o app normalmente e a máquina entra como Pendente.

## 2.11.42

Conectar com Suporte rápido.

- **Botão Conectar da barra de cima** ganhou duas abas: **Digitar o ID** (como antes) e **Suporte rápido**.
- **Suporte rápido:** informe o cliente ou o chamado e a validade; o painel gera o link `/s/<código>` para mandar ao cliente (copiar link ou mensagem pronta). O cliente baixa o app de suporte, sem instalar, e a máquina aparece na fila já identificada.
- **Acompanhar o link:** usuário comum vai para Minha área > Suporte avulso (`/my/support`); só o administrador usa `/user/support`.

## 2.11.41

Acabamento de interface achado no teste ao vivo em produção.

- **Atualizações do app, coluna Ações:** os botões quebravam em linhas desiguais e centralizadas (4 botões numa coluna de 356 px). Agora as ações principais (Autorizar ou Renovar, Publicar ou Alterar, Excluir) ficam sempre na mesma linha, alinhadas à direita, e "Disponibilizar aos analistas" ou "Suspender download dos analistas" vira uma ação secundária na linha de baixo.
- **Itens gerados:** as caixas de seleção tinham contraste de 1,2:1 (borda cinza claro sobre branco) e passam a usar a cor de texto secundária; os botões da linha de ações (Atualizar situação etc.) ficam com a mesma altura (36 px) e o mesmo estilo dos botões de download.
- **Gerador:** a rolagem interna ao lado da rolagem da página (iframe 12 px menor que o conteúdo) é corrigida no gerador 2.3.10.

## 2.11.40

Acabamento da lista de Itens gerados (item P3 da revisão de UX). Par do gerador 2.3.9.

- **Excluir na linha de ações:** o botão deixa de ficar sozinho numa linha abaixo do item e passa para a linha dos downloads e de Enviar para Atualizações, alinhado à direita. Itens que só podem ser excluídos (por exemplo, com falha) também ganham essa linha. O comportamento e as confirmações de exclusão não mudaram.

## 2.11.39

Refino da tela Gerar cliente, itens P2 do painel. Funciona com qualquer gerador; as mudanças do formulário vêm no gerador 2.3.8.

- **Menos orientação repetida:** o guia "O que preencher e o que já vem pronto" sai da aba Novo instalador (as dicas ficam nos próprios campos do gerador).
- **Etapa 3 vira atalho:** "Atualizar" nas etapas leva direto a Atualizações do app.
- **Protocolo do botão Conectar mudou de lugar:** é uma configuração do painel, não da geração; agora fica em Ajustes do servidor, no cartão "Botão Conectar do painel", com o mesmo modo automático.
## 2.11.38

Suporte avulso: link por atendimento e página no tema claro.

- **Link por atendimento:** em Suporte avulso, "Link por atendimento" cria um link para cada cliente ou chamado (validade de 1 a 24 horas). A pessoa abre `/s/<código>`, vê "Atendimento para <cliente>" e baixa o app. O código usa só letras e números fáceis de ditar por telefone.
- **A máquina aparece identificada:** quando o app abre, a máquina que entra em "Aguardando atendimento" é associada ao link pelo IP e pelo horário do download. Se o IP não bater e houver só um link e uma máquina possíveis, associa pelo horário e mostra "(provável)". Em caso de dúvida (duas máquinas para um link), não associa.
- **Lista de links** com a situação (aguardando, baixado, na fila, vencido, cancelado), **Conectar** direto na máquina associada e **Cancelar**. Cada técnico vê os seus; administrador vê todos.
- **Página pública no tema claro com a identidade do painel:** barra branca com a marca, cartão com cantos arredondados, roxo Nextec e fonte Open Sans.
- **Patch 0040** (link por atendimento) e patch 0010 (página); o app e o consentimento não mudam: a pessoa continua precisando clicar em Aceitar.

## 2.11.37

Suporte avulso: publicar o app direto da tela.

- **Escolha na própria tela:** sem app publicado, o cartão "Aplicativo de suporte" já lista os `.exe` gerados (os que parecem app de suporte primeiro) com **Usar este** e **Carregar mais**, sem abrir diálogo. "Prefiro enviar um arquivo .exe" continua disponível.
- **Menos repetição:** a tela dizia três vezes que o app não foi enviado e um dos links apontava para a própria página. Agora há uma frase no topo, e a fila "Aguardando atendimento" não repete o alerta nem os botões de copiar.

## 2.11.35

Página pública de suporte (`/suporte`) com a identidade da Nextec.

- **Visual:** faixa azul-marinho com a marca Nextec, cartão com título claro, botão grande de download (com tamanho e plataforma), três passos curtos e aviso de segurança. Claro e escuro automáticos, leitura confortável no celular, foco visível e sem script.
- **Menos ansiedade, mais clareza:** o aviso do Windows (SmartScreen) vira uma pergunta recolhível "O Windows mostrou um aviso?"; o texto diz onde achar o arquivo (pasta Downloads) e que o cliente continua no controle.
- **Estado indisponível amigável:** sem app publicado, a página explica o que fazer em vez de uma frase seca.
- **Autossuficiente:** logo embutido (data URI); a página continua sem depender de arquivos externos. CSP passa a permitir só `img-src data:`.
- **Patch 0010 reescrito** (página); o teste de execução `nextec/testes/suporte.ps1` continua válido (botão `/suporte/baixar`, nome do arquivo, texto "não está disponível").
- **Endereço mais amigável:** a página responde em qualquer hostname que chegue ao painel. Para um alias (por exemplo `suporte.nex.tec.br`), ver o passo a passo no PR; o painel ainda mostra o link com o endereço em uso.

## 2.11.33

Tipo da versão correto para versões enviadas à mão e layout da coluna Versão.

- **Não chuta mais "Cliente padrão":** uma versão enviada à mão (antes de o gerador registrar o tipo) aparece como **Tipo não registrado**, com o botão **Definir tipo** (Analistas ou Cliente padrão). Versões vindas do gerador mostram o "Destinado a" escolhido lá e não podem ser alteradas por aqui.
- **Patch 0039:** `POST /nextec/updates/profile` define o tipo só em versão sem geração e sem tipo; audita `update_profile`. A trava é um UPDATE condicional: duas requisições simultâneas não sobrescrevem a primeira escolha.
- **Sem tipo não disponibiliza:** "Disponibilizar aos analistas" fica bloqueado para versão com tipo não registrado (a tela pede para definir o tipo; o servidor também recusa, patch 0025).
- **Tipo não muda com a versão publicada:** `POST /nextec/updates/profile` recusa enquanto a versão estiver em publicação (padrão ou por cliente/máquina); se uma publicação entrar no meio da gravação, a escolha é desfeita.
- **Coluna Versão:** número, etiquetas (tipo e "Download dos analistas") lado a lado e nome do arquivo embaixo, sem quebrar em colunas estreitas.

## 2.11.32

Tipo da versão claro, confirmação ao disponibilizar e app de suporte a partir do que já foi gerado.

- **Tipo da versão em Atualizações do app:** cada linha mostra a etiqueta **Analistas**, **Cliente padrão** ou **Cliente específico** (o "Destinado a" escolhido no gerador), separada do nome do app.
- **Confirmação em "Disponibilizar aos analistas":** o painel explica que a versão passa a ser o app que os analistas baixam, qual versão ela substitui e que o protocolo do Conectar passa a seguir o nome do arquivo. Se a versão não foi gerada como "Analistas", aparece um aviso explícito (por exemplo, o cliente dos servidores com agente).
- **Suporte avulso usa os itens gerados:** em Suporte avulso > Aplicativo de suporte, o diálogo lista os `.exe` já gerados (os que parecem app de suporte primeiro) e **Usar este** publica o arquivo sem baixar e subir à mão. O envio manual do `.exe` continua disponível.
- **Lista com "Carregar mais":** o diálogo consulta 50 itens por vez e mostra "N de M itens consultados"; um app de suporte mais antigo aparece depois de carregar mais, e a mensagem "nenhum .exe" só vale quando não há mais páginas.
- **Atualizador no agente (adiado):** registrar a tarefa de atualização pelo `.cmd` do agente exige ajustar o pacote embutido e os testes do `.cmd`; fica como tarefa própria. Antes, confira nas máquinas se a tarefa `Nextec Acesso - Atualizacao` já existe.

## 2.11.31

Autorizar atualização em um passo.

- **Assinar no navegador:** em Atualizações do app > Autorizar, escolha o arquivo da chave do atualizador, digite a senha e clique **Assinar e autorizar**. O navegador baixa e confere os pacotes (SHA-256 e tamanho), monta o manifesto e assina localmente (RSA SHA-256, mesmo formato do assinador). Não precisa baixar o assinador, nem subir arquivos.
- **A chave não sai do computador:** o arquivo `.pem` cifrado é lido pelo próprio navegador e aberto com a senha digitada; nada disso é enviado ao painel, só o manifesto e a assinatura.
- **Lembrar a chave neste navegador (opcional):** guarda o `.pem` cifrado no armazenamento local, continua protegido pela senha.
- **Terminal continua disponível:** a seção "avançado" mostra o comando pronto para copiar (`Assinar-Versao.ps1 -Versao X`) e o fluxo antigo com arquivos.
- **Limite:** o navegador confere hash e tamanho do MSI e dos DEB contra o pedido, mas não abre o conteúdo do MSI (ProductName e ProductVersion) como o assinador local faz.
- **Testes:** `assinatura-navegador.test.mjs` compara o manifesto byte a byte com o do assinador Python e verifica a assinatura com a chave pública.

## 2.11.30

Transferência de arquivos sem pedir senha.

- **Transferir arquivos pelo painel:** em Dispositivos, menu "..." > **Transferir arquivos**. Abre o app direto na transferência de arquivos (`<protocolo>://file-transfer/<id>`), com a mesma senha do cofre e as mesmas regras de permissão do Conectar.
- **Motivo:** o botão de transferência de dentro da sessão abre uma conexão nova e, neste cliente, pedia a senha de novo ("Senha incorreta"). O link do painel já leva a senha vigente.

## 2.11.29

Conectar abre o app instalado no seu computador.

- **Protocolo do link vem do app de quem conecta, não do app da máquina remota:** o link `<protocolo>://<id>` é aberto no computador do analista, que tem o app global (por exemplo `Nextec-Connect`). Antes o painel usava o nome do app do servidor (`Cliente-Nextec-Connect`), que o analista não tem, e o app não abria. Agora vale o protocolo global configurado em Gerar cliente > Avançado.
- **Nome do app da máquina é só informação:** continua aparecendo no estado do agente e vem como `machine_app_name` no link; não muda o protocolo.
- **Aviso de abertura genérico:** "Abrindo o aplicativo..." em vez do nome do app do servidor.
- **Protocolo automático (patch 0038):** sem protocolo configurado, o painel usa o nome do app publicado em Atualizações do app (arquivo sem a extensão). O analista não escolhe nada; o campo em Gerar cliente > Avançado continua como sobrescrita do administrador. Limpar o campo e salvar volta ao automático (antes gravava `rustdesk`); quem já salvou `rustdesk` explicitamente precisa limpar o campo uma vez.

## 2.11.28

Ajuste de texto e do layout do gerador.

- **Aviso do item antigo mais claro e mais longo:** ao tentar de novo um item gerado antes do registro do nome do aplicativo, o aviso fica 8 segundos e pede para conferir o campo.
- **Modelos salvos no topo do formulário e layout no padrão do painel:** vem do rdgen (PR do mesmo tema); ficam visíveis depois do deploy do gerador.

## 2.11.27

Falha ao gerar um instalador agora diz o motivo e deixa tentar de novo.

- **Tentar de novo:** itens com falha em Itens gerados ganham o botão, que reabre Novo instalador com nome, cliente, perfil, plataforma e notas já preenchidos. Arquivos e segredos nunca voltam.
- **Mensagem clara no lugar do JSON cru:** o texto do item e a página de erro do gerador explicam o que aconteceu e o que fazer (Actions desativado, token inválido, sem permissão, limite do GitHub, repositório não encontrado, GitHub instável, rede).
- **Nome do aplicativo preservado:** a nova tentativa usa o nome do aplicativo guardado no catálogo (campo novo do rdgen), não o nome do arquivo, para não trocar o protocolo do Conectar. Item antigo, sem esse dado, abre com aviso para conferir o campo.
- **Segunda tentativa recarrega:** repetir o mesmo item reabre o formulário mesmo que o iframe esteja numa página de erro.
- **rdgen:** depende do rdgen #53 (mensagens de erro e campo `app_name`); sem ele o item abre com o aviso e o texto de erro continua o antigo.

## 2.11.26

Tela **Gerar cliente** arrumada.

- **Sem título repetido:** o título e a descrição já estão no topo da página; o cartão não os repete mais.
- **Uma linha de abas:** Novo instalador, Identidade visual e Itens gerados, com o botão Abrir em outra aba ao lado. Antes havia duas fileiras de abas (uma do painel, outra de dentro do gerador).
- **Identidade visual dentro do painel:** carrega na própria tela, sem cabeçalho duplicado.
- **Gerador embutido sem moldura:** fundo igual ao do cartão do painel, sem cabeçalho próprio, sem título "Novo instalador" repetido.
- **Guia "O que preencher" fechado por padrão:** o formulário aparece sem rolar.
- **rdgen:** depende do ajuste em `embed.html` do gerador (PR de mesmo nome); sem ele, o cabeçalho antigo continua aparecendo dentro do painel.

## 2.11.25

Dois defeitos do agente achados no teste ponta a ponta no Windows Sandbox (app real, Windows em português).

- **Agente antigo + `.cmd` abortava e desfazia a instalação:** `Write-NextecProvisionLog` trocava por `protocol_error` todo código fora de uma lista copiada à mão, e `Resolve-NextecOldAgent` grava `old_agent_replace_<motivo>` e `agent_repaired`, que não estavam nela. O `.cmd` lê `protocol_error` no fim da linha, abortava e desfazia antes de o coordenador falar com o painel. Agora a lista é uma só (`Get-NextecProvisionLogCodes`, com os códigos novos), consumida pelo gravador. Código desconhecido não derruba mais nada: é registrado como `unknown_code [texto]` (texto seguro, até 48 caracteres, sequência longa que lembre token vira `redigido`, entre colchetes para o `.cmd` nunca confundir com um código de falha). Também deixa de virar `protocol_error` o `pending_authorization` que seguia o `pending` a cada rodada.
- **Tarefa de senha recriada a cada rodada em Windows pt-BR:** `Test-NextecAgentTaskShape` comparava `Principal.UserId` com o texto `SYSTEM`; no pt-BR o valor é `SISTEMA`, então a tarefa nunca era "pronta" e era registrada e disparada de novo a cada 2 minutos. A conta passa a ser identificada pelo SID (`S-1-5-18`, via `NTAccount.Translate`), nunca por nome localizado. Varredura do repositório: nenhuma outra comparação por nome de conta ou grupo (as demais já usavam SID).
- **Testes que falham antes e passam depois:** `test_log_codigos.ps1` (log real em arquivo, sem dublê; só a ACL, que exige elevação, é substituída), `test_reinstalar_agente.ps1` e `test_agent_401_integration.ps1` passaram a usar o log real (o dublê era o que escondia o BUG 1), `test_coordinator.ps1` com a conta localizada (`SISTEMA`) e `codigos-log-provisionamento.test.mjs` (lista única, códigos que o `.cmd` lê, nenhum nome de conta localizado nos scripts).
- **Vale em qualquer idioma do Windows (requisito do dono):** varredura de `.ps1`, `.mjs`, `.cmd` gerado e `.py` por texto localizado. Decisões por SID, propriedade de objeto e código; nenhuma saída textual de `schtasks`, `sc`, `net`, `whoami`, `icacls`, `reg`, `wmic` ou `netsh`, nenhuma mensagem de erro do Windows em `-match`, nenhum nome de pasta fixo (usa `%ProgramFiles%`/`%ProgramData%`). Único defeito de cultura achado: a data dos logs (`Agente-Senha`, `Coordenar`, `Instalar`, `Provisionar` e o `.cmd`) usava a cultura do processo (em fi-FI o separador vira `.`, em th-TH e ar-SA o ano muda); agora `InvariantCulture`, e o carimbo `yyyyMMdd-HHmmss` dos backups também. Os logs continuam em português. O app imprime `Settings are disabled!` em inglês fixo (não depende do idioma do Windows).
- **Trava estática:** `verificar-integridade.mjs` (item e) reprova em script de produção nome localizado de conta/grupo comparado como texto, saída de utilitário do Windows, mensagem de erro em `-match`/`-like`, data sem cultura e pasta localizada. Teste novo `test_idioma.ps1` roda as funções reais com a cultura do processo em pt-BR, en-US, es-ES, de-DE, fr-FR, fi-FI, th-TH e ar-SA.
- **rdgen:** depois do merge o rdgen precisa ressincronizar `Provisionar-Agente-Nextec.ps1` (o ressincronismo é outro trabalho).

## 2.11.24

- **Agente reconhece o cliente gerado com "Bloquear configurações":** no RustDesk 1.5.0, a opção `disable-settings` do gerador faz `--password` e `--option` responderem "Settings are disabled!". O agente registrava `password_apply_failed` a cada rodada e o painel ficava em "Aguardando a primeira troca". Agora a resposta vira o código estável `client_settings_locked`, com a orientação no `agente-senha.log`: "O app foi gerado com 'Bloquear configurações'; gere o instalador de novo com a versão atual do gerador e instale por cima". O `--option` também é conferido (antes o log dizia "Opção approve-mode = password" sem ter aplicado nada).
- **Sem repetir a cada rodada:** depois de `client_settings_locked` o agente espera 6 h (`agente-senha.bloqueio.json` em `%ProgramData%\Nextec\Acesso`) sem chamar o cliente nem escrever no log; o sync com o painel continua. Instalar o app por cima muda o executável e encerra a espera na hora.
- **Painel vê a falha (revisão, campo `last_error` do 0035):** o agente guarda o código estável da última rodada que falhou (`agente-senha.ultimo-erro`, só o código, sem texto livre nem segredo; falha de rede ou HTTP não conta) e o envia como `last_error` no mesmo corpo do `/agent/sync`, junto de `interval_seconds` e `app_name`. Durante a espera de `client_settings_locked` cada sync leva o código, e a tela mostra "A troca de senha está falhando" com a ação; a primeira rodada sem erro apaga o arquivo e o sync seguinte vai sem o campo, o que limpa o aviso no painel. Fila linear: este PR mescla o #92 (que já traz #93 e #94) e mantém os dois comportamentos no `Agente-Senha-Nextec.ps1` (repetição curta e log sem inundar do #94, espera de 6 h deste PR).
- **Teste novo:** `nextec/atualizacao/test_client_settings_locked.ps1` (Windows PowerShell 5.1) roda o agente real contra um executável dublê que responde "Settings are disabled!". O gerador corrigido (rdgen) deixa de gravar `disable-settings` quando o app tem o agente; depois do merge, o rdgen precisa ressincronizar `Agente-Senha-Nextec.ps1`.

## 2.11.23

Conectar abre o app direto, com o protocolo da própria máquina, e avisa quando a senha automática ainda não foi aplicada.

- **Abre direto, sem diálogo:** ao clicar em Conectar (Senhas dos servidores, Dispositivos, Acesso rápido, Meus dispositivos, Salvos, Compartilhados, lista de espera e busca do topo), o painel dispara o protocolo na hora quando o app já abriu com sucesso antes neste navegador (lembrança por protocolo em `localStorage`, com tratamento de erro) ou quando a máquina tem agente ativo. Aparece só um aviso curto por 8 s ("Abrindo o <app>...") com o link discreto "Não abriu? Baixar aplicativo", que leva ao diálogo completo. O diálogo completo continua na primeira vez e em "Não abriu?". A abertura é detectada por perda de foco ou aba oculta, com prazo; se não abriu, a lembrança é esquecida e a próxima vez cai no diálogo. O nome do app mostrado vem do que a máquina informou (sem nome fixo no painel).
- **Protocolo por máquina, sem literal:** o agente envia o `AppName` do marcador (`HKLM\SOFTWARE\Nextec\Agente` ou `nextec-marker.json`) como `app_name` no `/api/nextec/agent/sync` e o painel monta o link com o nome normalizado em minúsculas (o RustDesk registra o protocolo com o nome do app em minúsculas: `Client-Nextec-Connect` abre `client-nextec-connect://`). Sem nome informado, vale o protocolo global configurado em Dispositivos > Gerar cliente (patch 0020), que passa a ser só o fallback. Patch novo `0036-app-name-por-maquina.patch`, aditivo e retrocompatível (coluna nova; agente antigo e painel antigo continuam funcionando), com validação `[A-Za-z0-9-]{1,64}`, lista de protocolos proibidos (http, https, file, javascript, data...) e só máquina aprovada decide o protocolo. A resposta de `/my/connect-link` ganhou `scheme`, `scheme_source`, `app_name`, `agent_active`, `password_state` e `last_seen_at`; a lista de Senhas dos servidores mostra o app da máquina.
- **Senha ainda não aplicada:** com agente ativo e regra ligada, mas "Aguardando a primeira troca", Conectar não abre em silêncio para cair no pedido de senha. Mostra "A senha automática ainda não foi aplicada nesta máquina (próxima verificação em ~N min). Você pode conectar e digitar a senha, ou aguardar." com [Conectar mesmo assim] e, para administrador, [Trocar agora]; os demais veem [Aguardar]. O aviso só aparece para quem receberia a senha do cofre.
- **Agente:** `Agente-Senha-Nextec.ps1` envia `app_name` lido do marcador (sem nome fixo; nome fora de `[A-Za-z0-9-]{1,64}` não é enviado). O pacote embutido no `Ativar-Nextec-<ID>.cmd` acompanha a árvore. **Depois do merge o rdgen precisa ressincronizar `Agente-Senha-Nextec.ps1`.**
- **Integração na fila (revisão):** o patch do nome do app passou a ser o **0037** (série contígua: 0035 estado do agente, 0036 limite e intervalo real, 0037 nome do app) e foi regenerado sobre os anteriores. `app_name`, `last_error` e `interval_seconds` são gravados no **mesmo** handler e na mesma escrita do `/agent/sync`; o agente manda os três no mesmo corpo. "Agente ativo" do Conectar (abrir direto) usa o `agent_state` do servidor, a mesma regra da lista (não mais 20 min de `last_seen_at`), e o aviso da primeira senha conta a partir da última consulta real.
- **Testes:** `connect-open.test.mjs` (decisão, esquema por nome, lembrança, detecção, aviso), `connect-abre-direto.spec.mjs` (montagem jsdom de Senhas dos servidores e Acesso rápido), `test_app_name.ps1` (Windows PowerShell 5.1) e testes Go com `-race` do patch 0036.

## 2.11.22

Senha automática mais rápida: do cadastro à primeira senha e do "Trocar agora" à senha nova, em minutos e não mais em dezenas de minutos. Vale para os scripts do agente instalados daqui em diante (as máquinas já instaladas migram sozinhas, veja abaixo).

- **Antes e depois (estimativa, uma máquina com a regra ligada):** "Trocar agora" levava de 0 a 5 min (média 2,5 min) até a troca começar; agora de 0 a 1 min (média 30 s). Primeira senha depois da atribuição no painel: de 0 a 5 min, agora de 0 a 1 min. Cadastro depois da instalação: o coordenador repete a cada 2 min (antes 5) quando o serviço do RustDesk ainda estava subindo, e a tarefa de senha é disparada na hora, sem esperar a repetição. O que não muda: o intervalo das regras (15 min a 24 h), o protocolo `transaction_v1` e a regra de só aplicar depois do ok do painel e só confirmar depois de o app aceitar a senha.
- **Intervalo em um lugar só:** `Get-NextecAgentIntervals` em `Agente-Senha-Nextec.ps1` (`PasswordMinutes` = 1, `CoordinatorMinutes` = 2, aceita de 1 a 60). `Provisionar-Agente-Nextec.ps1` e `Coordenar-Agente-Nextec.ps1` leem o valor desse arquivo, sem executar nada (só os literais do hashtable), e não existe mais número de intervalo espalhado. Agente de versão anterior, sem a função, vale como 5 minutos (legado), então um Provisionar novo com agente velho não recria a tarefa em loop.
- **Migração automática:** o validador de tarefa do Provisionar passou a aceitar repetição de até `PasswordMinutes`. A tarefa antiga de 5 minutos deixa de valer e o coordenador, que já valida a tarefa completa, registra de novo com 1 minuto. A tarefa do coordenador usa o novo valor quando é registrada (instalação ou atualização do MSI).
- **Disparo imediato:** registrar ou reparar a tarefa de senha (cadastro por inscrição, por autorização, reparo do coordenador, `-Registrar`) já executa a tarefa na hora. Se ela já está rodando ou desabilitada, não dispara de novo; falha ao iniciar não derruba o registro.
- **Uma execução por vez:** a execução do agente pega uma trava de arquivo (`agente-senha.lock`, aberta sem compartilhamento e liberada pelo sistema se o processo morrer). Repetição, disparo imediato e execução manual nunca trocam a senha ao mesmo tempo; quem chega com a trava ocupada sai sem erro.
- **Propor, aplicar e confirmar na mesma execução, com repetição curta:** falha de rede ou 5xx/408/429 ao propor ou confirmar repete (2 s e 5 s) na mesma execução; a confirmação é idempotente no painel, então repetir resolve também o caso de o painel gravar e a resposta se perder. O app que recusa a senha uma vez (serviço ainda subindo) é tentado de novo antes de desistir. 401, 403 e 409 nunca são repetidos. A senha só é aplicada depois do ok da proposta, só é confirmada depois de o app aceitar, e o diário local (`applied_operation_id`) continua permitindo retomar na próxima rodada.
- **429 não adia a aposentadoria de credencial morta:** o agente não zera nem soma a contagem de 401 quando recebe 429.
- **Menos ruído:** a linha "nenhuma troca necessária" (e a mesma falha repetida) vai ao `agente-senha.log` no máximo uma vez por hora; antes, a 1 consulta por minuto, seriam 1.440 linhas por dia.
- **Painel:** "Trocar agora" e "Ligar senha automática" avisam "A troca começa em até 1 minuto", a linha mostra "Troca solicitada" enquanto o pedido está pendente e a lista é recarregada sozinha a cada 15 s (só com a aba visível, no máximo 3 min) até a versão da senha mudar, quando aparece "Senha trocada". A estimativa de próxima verificação usa o ciclo de 1 minuto e não acusa atraso em agente ainda no ritmo antigo (5 min).
- **Servidor (patch 0036, aditivo):** limite de 30 chamadas por minuto por máquina já autenticada (janela deslizante em memória, resposta 429 com `Retry-After` e corpo `{"error":"rate limited"}`), mais de 10 vezes o pior caso legítimo (sync, propose e confirm com repetições). O limite nunca soma ao contador de falhas por IP (`nextecFailCheck` continua contando só autenticação inválida): uma máquina legítima consultando a cada minuto não aciona o anti-lixo, e uma máquina em laço (clone de VM com o mesmo ID e token) leva 429 sozinha, sem bloquear as outras do mesmo IP. O log do limite sai no máximo uma vez por minuto por máquina.
- **Estado do agente com fonte única (revisão):** com o ciclo de 60 s a tela calculava a janela de "ativo" como 3 x 60 s = 180 s, enquanto a API usava 900 s; um `last_sync_at` de 240 s atrás aparecia "parado" na tela e "ativo" na API (agentes legados de 5 minutos e reinstalação). Agora o **servidor decide** `agent_state` com o intervalo real de cada agente: o agente manda `interval_seconds` no sync (aditivo; agente antigo sem o campo vale 300 s) e a API considera ativo se `last_sync_at` estiver dentro de 3 intervalos (mínimo 180 s, máximo 900 s), devolvendo também `active_window_seconds`. A tela só exibe o `agent_state` da API, sem recalcular janela; só um servidor anterior ao campo cai na regra local com 900 s.
- **Numeração dos patches:** a série fica contígua na ordem da fila: 0035 (estado do agente, #93), 0036 (este limite e o intervalo real, antes 0037) e 0037 (nome do app por máquina, #92).
- **Testes:** `nextec/atualizacao/test_latencia_troca.ps1` (PowerShell 5.1: constante única lida pelos três scripts, tarefa registrada com a constante, migração da tarefa de 5 minutos, disparo imediato sem duplicar, trava entre processos de verdade, propor/aplicar/confirmar na mesma execução com falhas transitórias, log sem inundar, 429 e a contagem de 401); caso novo em `test_coordinator.ps1` (migração pelo coordenador); `rotation-watch.test.mjs`, `agent-cycle.test.mjs` e `secrets-panel.spec.mjs` no painel; `service/nextec_agent_ratelimit_test.go` e `service/nextec_agent_interval_test.go` (agente de 60 s parado aos 240 s, legado sem o campo ativo aos 240 s, coluna aditiva) e `http/controller/api/nextec_agent_interval_test.go` no servidor, com `-race`; `agent-state.test.mjs` (a tela segue o `agent_state` da API nos mesmos casos) e `test_password_transaction.ps1` (o sync leva `interval_seconds = 60`).

## 2.11.21

Estado do agente honesto: derivado de contato real, nunca do cadastro. **Exige a imagem nova do servidor** (patch 0035 da API, coluna aditiva).

- **O problema:** o painel mostrava "Agente ativo, visto há 1 minuto", etapa 3 de 3 "Tudo pronto" e "Aguardando a primeira troca" para um servidor que não tinha agente nenhum. O cadastro (autorização individual ou inscrição) grava `last_seen_at = agora`, e depois os arquivos e tarefas foram desfeitos pelo rollback do `.cmd` (ou nunca chegaram). Resultado: o painel achava que estava pronto, não oferecia Instalar agente e uma autorização nova não substituía o token "ativo". Beco sem saída.
- **Quatro estados, calculados no servidor (`agent_state`) e repetidos na tela:** `ativo` (consulta `/agent/sync` autenticada há menos de 3 ciclos de 5 minutos, ou seja, 15 min), `parado` (cadastrado, sem consulta há mais de 15 min ou que nunca consultou), `pendente_aprovacao` e `sem_agente`. Campo novo `last_sync_at`: só a consulta real do agente preenche; `last_seen_at` continua sendo "qualquer escrita" (inclui o cadastro). Linhas anteriores à atualização têm `last_sync_at = 0` e aparecem como **parado** por até 5 minutos, até a próxima consulta do agente delas.
- **Tela Senhas dos servidores:** agente parado mostra "Agente cadastrado, mas sem contato há N min (ou nunca consultou o painel). Reinstale o agente.", o botão principal vira **Reinstalar agente** (mesmo arquivo `.cmd`), o stepper volta à etapa 2 ("Agente parado"), o resumo do topo conta "agentes parados" e leva ao botão. "Tudo pronto", "Agente ativo" e "Aguardando a primeira troca" só aparecem com consulta real. **Remover agente** fica visível na linha do agente parado, com a explicação (apaga o cadastro e as senhas guardadas; a senha que está na máquina continua valendo). Logo depois do cadastro o texto diz "aguardando a primeira consulta" (até 15 min) em vez de acusar falha.
- **Reinstalar de verdade (backend):** a autorização individual (`/secrets/bootstrap`, admin autenticado, código de 15 minutos amarrado ao ID e ao uuid) agora é **permitida para máquina cadastrada porém parada**. Ao ser usada, o bootstrap substitui o token do agente parado (o token antigo deixa de valer), mantém as senhas e versões do cofre, zera `last_sync_at` (continua parado até o agente novo consultar de verdade) e audita `agent_replaced_stale`. Com o agente **ativo** (ou aguardando aprovação) a recusa continua, no emitir e no usar: se o agente consultar entre emitir e usar, o código não é gasto. ID, uuid, hash e https não foram enfraquecidos. O diálogo Instalar agente explica o caso: agente ativo não oferece o download ("não é preciso reinstalar; para trocar, use Remover agente").
- **Troca de senha falhando aparece no painel:** caso real, o agente consultava normalmente, mas toda rodada falhava ao aplicar a senha (`Settings are disabled!`) e o painel mostrava "Aguardando a primeira troca" para sempre. O `/agent/sync` aceita agora o campo opcional `last_error` (código estável da última tentativa, por exemplo `client_settings_locked`, `password_apply_failed`, `exe_not_found`); a API guarda `last_error` e `last_error_at` (colunas aditivas no patch 0035; texto fora do formato vira `unknown_error`, nunca texto livre). Sync sem erro ou troca confirmada limpam. A tela mostra "A troca de senha está falhando: <motivo>" com a ação sugerida (para `client_settings_locked`: "Gere o instalador de novo e instale por cima.") no lugar de "Aguardando a primeira troca". Quem envia o campo é o `Agente-Senha-Nextec.ps1` (classificação feita em outro PR); agente antigo não envia e nada muda para ele.
- **Ativar-Nextec-<ID>.cmd:** se o cadastro no painel foi obtido e a instalação local falhou depois (rollback), o `.cmd` não tem como "descadastrar" (o token novo nunca foi guardado) e não precisa: sem arquivos nem tarefa não há consulta, então o painel passa sozinho a `parado` em até 15 minutos. A mensagem do rollback agora diz isso e manda usar **Reinstalar agente**; o `ativar.log` registra `painel_sem_consulta_ficara_parado` quando o coordenador chegou a rodar.
- **Reinstalar agente sem recusa indevida (revisão):** o `.cmd` com `-SubstituirAgenteAntigo` sondava o token antigo pelo `/agent/sync` normal; com 200 recusava como `already_enrolled` e, com o 0035, a própria sondagem gravava `last_sync_at` e fazia o painel recusar o bootstrap. Agora a sondagem usa `probe:true` (só confere o token, devolve `agent_state`, não grava `last_sync_at` nem `last_seen_at` e fica auditada como `agent_probe`). Decisão no provisionador: credencial válida e instalação local quebrada (tarefa ausente ou inválida, script faltando) **repara** com a credencial existente, sem cadastro novo; credencial ilegível, de outro ID, recusada (401) ou painel dizendo `parado` faz o bootstrap de substituição; agente ativo e saudável continua mantido. A credencial antiga **nunca sai do lugar antes de o painel aceitar o token novo** (troca com backup em `agente-senha.json.anterior`); recusa 409/401 do bootstrap deixa a máquina com o que tinha. O `.cmd` só considera o cadastro concluído pelo log quando já havia credencial.
- **Testes:** PS 5.1 `test_reinstalar_agente.ps1` (servidor HTTP simulado: credencial válida + tarefa ausente repara sem bootstrap, 401 substitui só depois de aceito, 409 mantém a credencial, sondagem sempre com `probe:true`) e `test_coordinator.ps1` atualizado; Go `nextec_agent_probe_test.go` (sondagem não altera `last_sync_at`/`last_seen_at`, bootstrap de agente parado aceito mesmo após a sondagem) e teste HTTP do `probe:true`. Go com `-race` (`service/nextec_agent_state_test.go`: cadastro sem consulta é parado, consulta real é ativo, consulta antiga é parado, bootstrap sobre parado substitui e audita, sobre ativo recusa sem gastar o código, pendente continua recusado, uuid errado negado, migração aditiva de linhas antigas); módulo puro `agent-state.mjs` (`nextec/testes/agent-state.test.mjs`) e montagem jsdom da tela nos estados ativo, parado (nunca consultou e contato antigo), com e sem sync real.
- Depois do merge a imagem precisa ser republicada para a API ganhar a coluna e o `agent_state`. Painel novo com API antiga: a tela cai em `last_seen_at` (comportamento de antes) até a imagem ser atualizada.

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
