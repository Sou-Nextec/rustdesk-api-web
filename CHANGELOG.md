# Novidades do painel Nextec

Cada versão segue o padrão `maior.menor.correção`. Esta página aparece no painel em **Novidades** (menu do usuário).

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
