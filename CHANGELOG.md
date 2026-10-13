# Novidades do painel Nextec

Cada versão segue o padrão `maior.menor.correção`. Esta página aparece no painel em **Novidades** (menu do usuário).

## 2.11.0

- **Inscrição global de máquinas:** o instalador passa a ser o mesmo para todos os clientes. A máquina se inscreve sozinha como pendente, sem senha e sem acesso. Em **Senhas dos servidores > Pendentes** você atribui a máquina a um cliente (regra do cliente, regra só da máquina ou sem regra) e só então o cofre gera e libera a senha.
- Rejeitar remove a inscrição; Bloquear impede a máquina de voltar (há uma lista de bloqueadas com Desbloquear).
- **Credencial de inscrição:** card para ver, copiar e girar a credencial que vai no instalador. Girar invalida instaladores antigos e some com as pendentes feitas com a credencial anterior; máquinas já atribuídas não são afetadas.
- A autorização individual de 15 minutos continua como contingência. Máquinas existentes permanecem aprovadas, sem migração.
- API (patch 0031): endpoint `self-enroll`, limites de inscrição por IP, total e de pendentes, e rotas de atribuição, rejeição, bloqueio e credencial no admin.

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
