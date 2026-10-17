# Projeto Sentinela: documento de abertura

Registro histórico da conversa de 17/10/2026 que definiu a visão da plataforma. **Este documento é fechado:** não recebe
alterações depois de aprovado. Mudanças de rumo entram no roadmap (`nextec/sentinela/ROADMAP.md`), que é o documento vivo.

**Nome (definido):** Projeto Sentinela internamente; **Sentinela** como nome da plataforma. O nome é independente da
marca Nextec, pensando num possível produto. O texto usa "plataforma" para o Sentinela e "Nextec Connect" para o acesso
remoto atual, que passa a fazer parte dele.

## 1. Ponto de partida

- O Nextec Connect (fork do RustDesk com painel próprio) já tem: cofre com troca automática da senha do RustDesk por regra
  de grupo ou máquina, rotação transacional, "Conectar" com um clique sem mostrar a senha, revelação só para admin com
  auditoria, autorização por cliente, login externo OIDC (modelo Entra ID), políticas e sessões com desconectar, agente
  no Windows (SYSTEM) e no Linux (root).
- A conversa começou por segurança: o analista não deve conhecer nenhuma senha, e quem sai da equipe não leva acesso.
- Foi avaliado usar um PAM open source como base (Guacamole, JumpServer, Teleport, Infisical PAM, Warpgate, Boundary).
  **Definido:** não adotar PAM externo. O Nextec Connect já cobre acesso por navegador, VNC e conexão direta com o painel,
  e a plataforma evolui a partir dele.

## 2. Premissas

1. **Segurança primeiro.** Toda funcionalidade nasce com auditoria, menor privilégio e corte imediato.
2. **Facilidade.** O analista ou fornecedor só faz login, clica onde quer ir e faz o que tem permissão para fazer. Nenhuma
   senha e nenhum segundo fator aparecem para ele.
3. **Público.** PMEs e cartórios (Provimento CNJ 213/2026), com a Nextec como operadora (MSP).

## 3. Visão

- Login único com MFA por um provedor de identidade externo (hoje o Entra ID). A partir dele o analista acessa tudo da
  Nextec e dos clientes.
- Tudo de clientes passa pela plataforma: acesso remoto, navegador, túnel ou VPN por usuário ou por empresa.
- Bloqueou o usuário num lugar, corta tudo: painel, app, sessões abertas e senhas que ele usou.
- A Nextec administra as máquinas do cliente pela plataforma, mesmo quando o cliente tem AD.
- Ninguém acessa servidor do cliente sem passar pela plataforma (no modo exclusivo).
- A plataforma está com cara de produto. **Definido:** não é para venda agora; se virar produto, o tema volta.

## 4. Identidade e acesso

**Definido**
- Provedor de identidade plugável: a plataforma não fica presa ao Entra. Suporte genérico a OIDC e SAML, para trocar
  por Keycloak, Authentik ou outro sem refazer nada. O Entra ID é o primeiro provedor.
- MFA resistente a phishing: passkey (FIDO2, inclusive no Microsoft Authenticator), Windows Hello for Business ou
  certificado. Notificação push e código de aplicativo, mesmo com correspondência de número, não atendem.
- Usuário local da própria plataforma (com MFA próprio) fica para o roadmap futuro.
- Acesso condicional: dispositivo gerenciado e país permitido.
- Acesso just-in-time: o analista pede, recebe por tempo definido e a liberação expira sozinha.
- Aprovação para contas críticas (root, Administrador do domínio) e dupla custódia para as mais críticas.
- Janela de acesso por usuário, fornecedor e cliente (ex.: horário comercial). Fora dela, o acesso é bloqueado ou vira
  pedido de aprovação de emergência, e a tentativa gera alerta.
- Fornecedor eventual: convite ou código único, com prazo, escopo restrito e MFA próprio.
- Prestador recorrente: login próprio na plataforma (conta convidada no provedor de identidade).
- Aprovação de acessos pelo celular, com um toque.
- Sessão com tempo máximo e reautenticação para contas críticas.
- Encerrar sessão remotamente e bloquear o usuário em tempo real.
- O técnico só vê o que pode acessar; sem permissão, a máquina nem aparece.
- Tela inicial com "meus clientes", busca, favoritos e um clique para conectar.
- O motivo do acesso é o número do chamado do Jira.

## 5. Cofre e rotação de senhas

**Definido**
- Senhas por cliente e por máquina, com chave de cifragem própria por cliente (isolamento entre clientes).
- Rotação das senhas do sistema operacional, não só a do RustDesk: Administrador, root e contas nominais com privilégio.
  Rotação por tempo e após cada uso (retirada e devolução).
- Contas de domínio rotacionadas pelo agente instalado no controlador de domínio.
- Conta nominal com privilégio fica desativada e é ativada só durante a sessão, para o log do Windows mostrar quem fez.
- Privilégio zero permanente: nenhuma conta fica com admin o tempo todo; o privilégio é criado na hora e removido no fim.
- Injeção da credencial: o painel entrega ao app um ticket de uso único; o app busca a credencial e envia a mensagem
  `OsLogin` do protocolo RustDesk (digita a senha na tela de bloqueio do Windows e do macOS; valida credenciais do Windows
  no modo terminal). A senha nunca vai na URL.
- Só o admin revela uma senha, com justificativa obrigatória e auditoria.
- Senha de emergência ("break glass") lacrada, para quando a plataforma cair.
- Senhas e segundos fatores abstraídos para o analista, no estilo de um gerenciador como o Bitwarden.
- Fim de contrato: exportação cifrada (planilha protegida por senha) com todas as senhas do cliente, com registro de quem
  gerou.
- Descoberta de contas: varrer as máquinas e encontrar contas administrativas esquecidas.
- Antes de rotacionar, mapear serviços e tarefas agendadas que usam a conta, para não derrubar sistemas do cartório.
- Remover o admin local dos usuários do cliente, com elevação sob demanda e aprovação.
- Cofre de segredos para sistemas e scripts: n8n e automações buscam a senha no cofre, sem texto aberto.
- Testar o login com a senha nova antes de descartar a antiga, em qualquer rotação.

**Em aberto**
- Linux: o modo terminal do RustDesk abre o shell com a conta do serviço e não valida a senha do root. Caminhos
  levantados: usuário temporário com sudo criado pelo agente, ou certificado SSH de curta duração.
- A credencial injetada passa pela memória do app do analista. A rotação após uso torna a senha descartável; a solução
  definitiva é o isolamento de sessão (seção 15).
- Validar o `OsLogin` na tela de bloqueio de um Windows Server com a versão do app gerada hoje.
- Identidade visual própria do Sentinela: preferência por base grafite; cor de destaque a definir. Até lá, os materiais
  seguem a identidade da Nextec.

## 6. Modo de acesso por cliente

**Definido:** campo configurável por cliente.
- **Exclusivo:** o servidor só aceita conexão vinda da plataforma.
- **Compartilhado:** a Nextec acessa pela plataforma e o cliente acessa direto; o agente coleta os logs de logon do Windows
  e alerta logon feito fora da plataforma.

## 7. Auditoria e retenção

**Definido**
- Gravação em vídeo das sessões gráficas e log de comandos das sessões de terminal.
- Busca dentro das gravações (ex.: quem digitou tal comando), caindo direto no trecho.
- Motivo de cada acesso ligado ao chamado do Jira.
- Logs enviados ao Grafana ou a um SIEM, num local que nem o admin consegue apagar.
- Revisão periódica de acessos: a plataforma pergunta se cada fornecedor ainda precisa de cada acesso.
- Retenção configurável por cliente:

| Tipo de cliente | Vídeo | Logs de texto e metadados |
| --- | --- | --- |
| Cartório | 5 anos | 5 anos |
| Empresa (padrão) | 1 ano | 2 anos |

  O prazo das empresas é ajustável por contrato.
- Estimativa de espaço: terminal ocupa poucos KB por sessão; vídeo de servidor Windows, de 50 a 100 MB por hora. Para
  5 analistas com 2 horas por dia: de 10 a 25 GB por mês, de 120 a 300 GB por ano, de 600 GB a 1,5 TB em 5 anos.
- Armazenamento de objetos compatível com S3, com camada fria para vídeos antigos e trava contra exclusão até o fim do prazo.
- LGPD: mascarar dados pessoais nas gravações e definir a retenção de cada log.

## 8. Infraestrutura crítica: servidor, firewall, switch e afins

**Definido**
- Coletor dentro da rede do cliente, que alcança equipamentos sem agente (SSH, HTTPS, API).
- Firewall:
  - gerência nunca exposta na internet; só o coletor entra como host confiável;
  - perfis de leitura (diagnóstico) e escrita (com aprovação ou janela de mudança);
  - conta administrativa da Nextec e token de API próprios, ambos rotacionados;
  - conta de emergência lacrada no cofre;
  - remoção de contas padrão e antigas descobertas;
  - backup da configuração antes e depois de cada sessão, com a diferença no chamado;
  - alerta de mudança feita fora da plataforma (syslog) e reverter com um clique;
  - alerta de regra perigosa (qualquer origem para qualquer destino);
  - simulação antes da mudança: o que vai abrir ou fechar e quais regras ficam redundantes.
- Fabricantes de firewall: FortiGate, MikroTik e pfSense primeiro (já existem nos clientes); depois SonicWall, Sophos,
  OPNsense e UniFi.

| Fabricante | Caminho de integração |
| --- | --- |
| FortiGate | API REST completa |
| MikroTik | API REST (RouterOS 7) |
| pfSense | SSH ou pacote de API da comunidade (sem API oficial madura) |
| SonicWall | API do SonicOS |
| Sophos Firewall | API em XML |
| OPNsense | API própria |
| UniFi | API do controlador |

- Também no escopo: switches, hipervisores (Proxmox, Hyper-V, VMware), bancos de dados (MySQL dos cartórios, com usuário
  criado na hora e consultas registradas), consoles na nuvem (Microsoft 365, Azure, Acronis, NAS), chaves SSH e
  certificados (inventário, rotação e alerta de vencimento).
- Lista de comandos permitidos por perfil, bloqueando comando perigoso na hora.

## 9. Acesso web (HTTP e HTTPS)

**Definido**
- Dois modos, escolhidos por sistema:
  - **Navegador isolado no coletor**, para painéis críticos (firewall, iDRAC, iLO, hipervisor, NAS, console do M365):
    o analista recebe só a imagem, a senha é injetada lá dentro, a sessão é gravada e downloads e cópias seguem o perfil;
  - **Proxy com identidade**, para sistemas de menor risco: túnel com o login da plataforma na frente e log de cada acesso.
- O alvo nunca fica exposto na internet; HTTP sem criptografia trafega dentro do túnel.
- As mesmas regras de janela, aprovação, auditoria e corte imediato valem para a web.
- Segundo fator de sistemas do cliente, classificado no onboarding em quatro casos:
  1. aceita SSO (SAML ou OIDC): federar com o provedor de identidade ou com a plataforma como provedor, sem senha guardada;
  2. código de aplicativo (TOTP): refazer o cadastro e guardar a semente no cofre; a plataforma gera e injeta o código;
  3. código por SMS ou e-mail: receber num número ou e-mail controlado pela plataforma, que lê e preenche;
  4. chave física ou push em celular específico: acesso manual, com aprovação e gravação.
- Rotação de senha de sistemas web em camadas, pelo coletor: API do fabricante, SSH ou linha de comando, automação do
  navegador, ou troca assistida (o analista troca com a senha nova injetada, sem vê-la).
- Biblioteca de conectores por fabricante e modelo; conectores Hikvision e Intelbras (DVR) como item próprio.
- Descoberta de painéis esquecidos (impressoras, câmeras, no-breaks com senha padrão).
- Alerta de certificado vencido ou inválido em sistemas internos.
- Sistemas externos de terceiros (fornecedores, bancos, governo) pelo navegador isolado, com senha no cofre.

## 10. Máquinas de usuário e RMM

**Definido**
- RMM e PAM num agente só e numa interface só.
- Funções padrão de RMM: inventário de hardware e software (com garantia e vida útil), biblioteca de scripts (em lote,
  agendados ou por alerta), ferramentas de bastidor sem interromper o usuário (tarefas, serviços, registro, arquivos,
  terminal), instalação e remoção em massa, políticas por cliente (BitLocker, firewall do Windows, bloqueio de USB) e
  relatório de saúde para o cliente.
- Acesso remoto em três formas, configuráveis: com senha, com aceite do usuário por clique (suporte rápido) ou
  administrativo sem usuário, igual ao de servidor.
- Banner de acesso monitorado com o nome da máquina e o monitoramento já vêm no instalador por cliente.
- Navegação entre máquinas dentro da mesma interface.
- Gestão de atualizações: anéis (Nextec, piloto por cliente, todos), janela por cliente (no cartório, fora do expediente e
  nunca em dia de fechamento), programas de terceiros (navegador, Java, Adobe, 7-Zip, sistemas do cartório), adiar ou
  bloquear uma atualização para todos com um clique, reinício com aviso e adiamento limitado.
- Nota de risco por máquina antes de atualizar: falhas na própria frota (anéis), perfil parecido com máquinas que tiveram
  problema (triagem rápida por IA) e problemas conhecidos publicados (IA maior resume). Risco alto vai para aprovação.
- Controle de aplicativos: lista do que pode rodar.
- Wake-on-LAN configurado pelo instalador (placa de rede, pacote mágico, inicialização rápida desligada); a BIOS pode
  precisar de ajuste (ferramentas Dell, HP e Lenovo ou presencial); o painel mostra quais máquinas não estão prontas.
  Acordar por outra máquina da rede, por timer do Windows (suspensão ou hibernação) ou por Intel vPro. Depois da rotina,
  a máquina volta ao estado anterior.
- Checagem de disco e drivers, com diagnóstico de leitura liberado e chamado aberto com a recomendação.
- Backup integrado ao painel (status do Acronis e alerta de falha).
- Autoatendimento na bandeja: abrir chamado com print, pedir programa aprovado, resetar a própria senha.
- Integração com Microsoft 365 e Entra: quem está logado, licenças e bloqueio de tudo na saída do funcionário.
- Onboarding e offboarding de máquina pelo perfil do cliente.
- Experiência do usuário: lentidão, travamentos e tempo de inicialização.
- Postura de segurança por máquina (antivírus, disco cifrado, atualizações, admin local), em relatório para o cliente.
- Documentação viva por cliente (rede, senhas, contatos, procedimentos), alimentada pelo inventário.
- Mapa da rede com descoberta dos equipamentos.
- Isolar a máquina com um clique, mantendo só a conexão com a plataforma (obrigatório).
- Linha de base de configuração (CIS) por tipo de máquina, com alerta de desvio.
- Caça a ameaças na frota toda.
- Monitoramento de credenciais vazadas dos clientes.
- Agente à prova de remoção e com assinatura digital (resolve também o bloqueio do Acronis).
- Scripts assinados; scripts críticos só com dupla aprovação.

## 11. Gestão de vulnerabilidades (para tudo)

**Definido**
1. Inventário: o coletor lê modelo e firmware de firewalls e switches; o agente lê sistema, atualizações pendentes e
   programas instalados de servidores e máquinas de usuário.
2. Cruzamento com NVD, catálogo CISA KEV e boletins dos fabricantes (ex.: FortiGuard).
3. Prioridade: falha já explorada com gerência exposta vai para o topo.
4. Chamado no Jira com cliente, equipamento e versão corrigida.
5. Resumo por IA em português: o que a falha faz, se o cliente está exposto e como mitigar antes de atualizar.
6. Correção em janela agendada, com piloto antes.
7. Relatório mensal de exposição para o cliente.

## 12. Inteligência artificial

**Definido**
- Triagem de alertas: falso positivo é resolvido, registrado e marcado como "resolvido pelo agente" (o agente terá nome
  próprio); caso crítico vai ao analista com a análise pronta, e ele confirma ou não.
- Níveis por tipo de ação: só diagnosticar, corrigir e avisar, ou corrigir sozinho. Ação destrutiva exige aprovação.
  Ex.: reparo do Windows com DISM aplicado e registrado pelo agente.
- Jev (TypeSafe AI, acesso antecipado desde 15/09/2026) na triagem barata: devolve decisão com nível de confiança; abaixo
  do limite ou crítico, vai para uma IA maior ou para uma pessoa. Usos: alertas de EDR e de logon, exposição a CVE,
  comando ou acesso fora do padrão, pedido de acesso de baixo risco. Começa só registrando as decisões; limite configurável.
- A resposta do analista ("acertou" ou "errou") calibra o limite de confiança de cada tipo de alerta.
- Amostragem: um analista revisa de tempos em tempos um caso aleatório fechado pela IA.
- Detecção de comportamento estranho (ex.: vinte servidores abertos de madrugada) e pontuação de risco por sessão, que
  pede mais autenticação quando algo foge do normal.
- Agentes de IA com acesso controlado: executam tarefas sob as mesmas regras do PAM (permissão limitada, aprovação,
  gravação), como um analista.
- Copiloto na sessão e resumo automático da sessão lançado como comentário técnico no chamado.

## 13. Diferenciais

**Definido**
- Conformidade contínua com o Provimento 213: cada exigência ligada às evidências que a plataforma coleta; painel
  pronto para a correição.
- Perguntas em linguagem natural sobre a auditoria (ex.: quem pode acessar o servidor do cartório X).
- Aviso ao responsável do cliente a cada acesso (WhatsApp ou e-mail), com opção de assistir à sessão ao vivo.
- Portal do cliente: quem acessou, quando e por quê, com aprovação de acessos se ele quiser.

## 14. Integrações e API

**Definido**
- A plataforma consome: provedor de identidade (OIDC ou SAML; Entra ID primeiro), Microsoft 365, Jira, Acronis, fabricantes (firewall, switch, câmera), fontes de
  vulnerabilidade (NVD, CISA, fabricantes), Jev e uma IA maior, WhatsApp e e-mail, Grafana ou SIEM.
- A plataforma oferece uma API própria documentada, com o mesmo controle de acesso, para n8n, scripts e um servidor MCP.
- Princípio: nada acessa nada direto; tudo passa pela plataforma, inclusive as automações.

## 15. Segurança da própria plataforma

A plataforma guarda a chave de todos os clientes e vira o alvo mais valioso. Segurança vem antes de funcionalidade.

| Nível | Itens |
| --- | --- |
| Básico (obrigatório) | MFA para todos, sem login local; cifragem em trânsito e em repouso, cofre cifrado por cliente; admin separado do operador, menor privilégio; atualizações e dependências em dia, com varredura de vulnerabilidades no código; backup cifrado fora da VPS com restauração testada; logs de auditoria que nem o admin apaga; gerência dos servidores nunca exposta na internet |
| Intermediário (a maioria tem) | Chave mestra em KMS ou HSM; acesso condicional; teste de invasão anual por terceiros; plano de resposta a incidente escrito e ensaiado; ambientes separados (desenvolvimento, teste, produção) com revisão de código obrigatória; alta disponibilidade com contingência documentada |
| Top (nível CyberArk) | Zero trust entre componentes; cofre com dupla custódia; builds reproduzíveis e assinados; ISO 27001 e SOC 2; programa de recompensa por falhas; monitoramento 24 horas |
| Extrapolar (novo) | Criptografia pós-quântica no cofre; identidade própria para agentes de IA; proteção contra injeção de prompt nas IAs que leem logs e alertas; computação confidencial; passkeys em todo lugar |

Itens no estilo CyberArk também definidos para a plataforma: isolamento de sessão (a senha nunca chega ao computador do
analista), privilégio zero permanente, detecção de ataques ao AD (roubo de credencial, golden ticket, uso de senha fora do
cofre) com reação automática, lista de comandos permitidos e dupla custódia.

Também definidos:
- Plano de continuidade: modo de contingência controlado para quando a plataforma ou a internet cair (cartório não pode
  parar).
- Contrato e termo de uso: cláusula para o cliente aceitar a gestão das senhas pela Nextec e a entrega delas no fim do
  contrato.

## 16. Fora do escopo

- MDM (gestão de celulares).
- Faturamento e contratos.
- Conscientização (simulação de phishing e treinamento).

## 17. Referências de mercado

- PAM: CyberArk (referência, modelo de segurança), BeyondTrust (mais parecida com a visão: remoto, cofre e fornecedor),
  Delinea, Keeper PAM e Devolutions (voltados a MSP).
- RMM: NinjaOne, Datto e N-able.
- Documentação viva: estilo IT Glue.

## 18. Arquitetura inicial

**Definido:** a arquitetura fica em documento próprio, `nextec/sentinela/ARQUITETURA.md` (boa prática de separar visão e
arquitetura).

## 19. Princípios de engenharia

**Definido:** segurança como base, interface só com o essencial, documentação contínua (correções e achados) e boas
práticas de programação assistida por IA. Regras em `nextec/sentinela/PRINCIPIOS.md`.

## 20. Ordem aprovada

1. Base segura.
2. Infraestrutura crítica.
3. RMM.
4. Conformidade e cliente.
5. Avançado.

Detalhamento, etapas, critérios de entrega e dependências: `nextec/sentinela/ROADMAP.md`.
Arquitetura: `nextec/sentinela/ARQUITETURA.md`.
