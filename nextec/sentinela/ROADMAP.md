# Projeto Sentinela: roadmap

Documento vivo. A origem de cada item está no documento de abertura (`nextec/sentinela/ABERTURA.md`), que é fechado.
Este roadmap substitui a seção "P3: PAM, identidade e continuidade" de `nextec/ROADMAP-CLIENTE.md`; os itens P0 a P2 de lá
continuam valendo e são pré-requisito da Fase 1.

## Como ler

- **Fases** seguem a ordem aprovada em 17/10/2026. Uma fase só começa quando a porta de saída da anterior estiver cumprida,
  exceto quando indicado em "Paralelo com a fase seguinte".
- **Etapas** têm código (ex.: 1.3), critério de entrega, dependências e se podem correr em paralelo.
- **Nível de evidência** do critério segue o `ROADMAP-CLIENTE.md`: local, CI, piloto ou produção. Só marcar concluído no
  nível pedido.
- Status: `[ ]` pendente, `[~]` em andamento, `[x]` concluído.

## Trilha transversal: segurança da plataforma

Corre ao lado de todas as fases e funciona como porta de saída.

| Nível | Quando precisa estar pronto |
| --- | --- |
| Básico | Antes de qualquer cliente usar a rotação de senha do SO (porta da Fase 1) |
| Intermediário | Antes do portal do cliente ficar exposto (porta da Fase 3) |
| Top | Ao longo da Fase 5 |
| Extrapolar | Avaliação contínua a partir da Fase 5 |

---

## Fase 1: Base segura

Objetivo: o analista entra pelo provedor de identidade (Entra primeiro), clica e acessa servidores sem conhecer nenhuma senha, e o bloqueio corta tudo.

| Etapa | Entrega | Critério de entrega | Depende de | Paralelo |
| --- | --- | --- | --- | --- |
| 1.1 | Segurança básica da plataforma | MFA para todos e login local desativado; cifragem em trânsito e em repouso; admin separado do operador; varredura de dependências e de código no CI; backup cifrado fora da VPS com uma restauração testada e registrada; logs de auditoria em destino só de escrita; gerência dos servidores fora da internet. Evidência: produção | P0 do `ROADMAP-CLIENTE.md` | Sim, com 1.2 e 1.3 |
| 1.2 | SSO plugável e bloqueio sincronizado | Login do painel e do app só pelo provedor de identidade com MFA resistente a phishing, por OIDC e SAML genéricos (Entra primeiro; trocar por Keycloak ou Authentik só por configuração); usuário desativado no provedor perde painel e app em até 5 minutos; sessões abertas derrubadas; acesso condicional (dispositivo gerenciado, país). Evidência: piloto com a equipe | Nenhuma | Sim, com 1.1 e 1.3 |
| 1.3 | Contrato, termo de uso e plano de continuidade | Cláusula de gestão de senhas e entrega no fim do contrato aprovada; modo de contingência descrito (como acessar o cliente com a plataforma fora) | Nenhuma | Sim, com tudo |
| 1.4 | Cofre de contas do SO | Modelo da D3 (cliente, grupo, ativo, conta, escopo, perfis e concessões); políticas de rotação configuráveis com precedência; perfis padrão e perfis personalizados; contas do SO por máquina com chave por cliente; revelação só por admin com justificativa e auditoria; senha de emergência lacrada; exportação cifrada de fim de contrato. Evidência: CI | 1.1 | Sim, com 1.5 |
| 1.5 | Descoberta e mapeamento antes de rotacionar | Agente lista contas administrativas locais e de domínio e os serviços e tarefas agendadas que usam cada conta; painel mostra o que bloqueia a rotação. Evidência: piloto em 1 cliente | Agente atual | Sim, com 1.4 |
| 1.6 | Rotação das senhas do SO | Agente troca Administrador, root e contas nominais por tempo e após uso, testando o login antes de descartar a anterior; contas de domínio pelo agente no controlador; conta nominal ativada só durante a sessão. Evidência: piloto | 1.4, 1.5 | Não |
| 1.7 | Conectar sem ver a senha | Ticket de uso único entregue ao app; app envia `OsLogin` sem exibir nem gravar a senha; senha nunca na URL; rotação ao fim da sessão. Validar primeiro o `OsLogin` na tela de bloqueio de um Windows Server. Evidência: piloto | 1.6, 1.2 | Não |
| 1.8 | Linux sem senha de root compartilhada | Definir e implementar usuário temporário com sudo criado pelo agente, ou certificado SSH de curta duração. Evidência: piloto | 1.6 | Sim, com 1.7 |
| 1.9 | Regras de acesso | Acesso just-in-time com expiração; janela de horário por usuário, fornecedor e cliente com alerta fora dela; aprovação para contas críticas; fornecedor por convite com prazo; prestador com conta convidada; motivo obrigatório ligado ao chamado do Jira; o técnico só vê o que pode acessar. Evidência: CI e piloto | 1.2 | Sim, com 1.6 a 1.8 |
| 1.10 | Modo por cliente e auditoria mínima | Campo exclusivo ou compartilhado por cliente; no exclusivo, firewall do servidor só aceita a plataforma; no compartilhado, agente coleta logon do Windows e alerta logon fora; retenção configurável por cliente (cartório 5 anos; empresa 1 e 2 anos). Evidência: piloto | 1.7, 1.9 | Não |
| 1.11 | Experiência de um clique | Tela "meus clientes" com busca, favoritos e conectar; sem nenhum campo de senha para o analista | 1.7 | Sim, com 1.10 |

**Porta de saída:** segurança básica em produção; piloto de rotação e conexão sem senha em 1 cliente por 30 dias sem
incidente; bloqueio no provedor de identidade comprovado cortando painel, app e sessão.

**Paralelo com a fase seguinte:** a etapa 2.1 (coletor) pode começar depois de 1.4.

---

## Fase 2: Infraestrutura crítica

Objetivo: firewall, switch, hipervisor, banco e painéis web pela plataforma, com gravação e auditoria completas.

| Etapa | Entrega | Critério de entrega | Depende de | Paralelo |
| --- | --- | --- | --- | --- |
| 2.1 | Coletor na rede do cliente | Coletor instalável por cliente, autenticado na plataforma, sem porta aberta para a internet; atualização assinada. Evidência: piloto | 1.4 | Sim, com 2.2 |
| 2.2 | Gravação e armazenamento | Vídeo das sessões gráficas e log de comandos do terminal; armazenamento S3 com camada fria e trava contra exclusão até o fim da retenção; mascaramento de dados pessoais; envio de logs ao Grafana ou SIEM. Evidência: piloto | 1.10 | Sim, com 2.1 |
| 2.3 | Firewalls do primeiro grupo | FortiGate, MikroTik e pfSense: gerência só pelo coletor; perfis leitura e escrita; conta e token da Nextec rotacionados; conta de emergência lacrada; remoção de contas padrão; backup de configuração antes e depois com diferença no chamado; alerta de mudança fora (syslog); reverter com um clique; alerta de regra perigosa. Evidência: piloto por fabricante | 2.1, 2.2 | Fabricantes entre si |
| 2.4 | Firewalls do segundo grupo | SonicWall, Sophos, OPNsense e UniFi com o mesmo critério de 2.3 | 2.3 | Fabricantes entre si |
| 2.5 | Acesso web | Navegador isolado no coletor para painéis críticos (senha injetada, sessão gravada, download e cópia por perfil); proxy com identidade para os de menor risco; alvo nunca exposto; HTTP só dentro do túnel. Evidência: piloto | 2.1 | Sim, com 2.3 |
| 2.6 | Segundo fator e rotação web | Classificação de cada sistema nos 4 casos (SSO, TOTP no cofre, SMS ou e-mail da plataforma, manual aprovado); rotação em camadas (API, SSH, automação do navegador, troca assistida) com teste de login antes de descartar | 2.5 | Sim, com 2.7 |
| 2.7 | Conectores Hikvision e Intelbras | Rotação de senha de DVR pela API dos dois fabricantes, com teste de login antes de descartar a anterior. Evidência: piloto | 2.1 | Sim, com 2.6 |
| 2.8 | Switches, hipervisores, banco, nuvem | Switches; Proxmox, Hyper-V e VMware; MySQL com usuário criado na hora e consultas registradas; consoles M365, Azure, Acronis e NAS pelo navegador isolado; inventário e rotação de chaves SSH e certificados com alerta de vencimento | 2.1, 2.5 | Itens entre si |
| 2.9 | Controles de sessão | Bloqueio de transferência de arquivos e área de transferência por perfil; tempo máximo de sessão e reautenticação para contas críticas; encerrar sessão remota | 2.2 | Sim, com 2.8 |
| 2.10 | Descoberta web e sistemas externos | Varredura de painéis esquecidos (impressora, câmera, no-break); alerta de certificado interno; portais de terceiros pelo navegador isolado | 2.5 | Sim, com 2.8 |
| 2.11 | Revisão periódica de acessos | A plataforma pergunta periodicamente se cada fornecedor ainda precisa de cada acesso; sem resposta, revoga | 1.9 | Sim, com tudo |

**Porta de saída:** FortiGate, MikroTik e pfSense em produção com rotação e backup de configuração; gravação em produção
com retenção por cliente comprovada; acesso web isolado em pelo menos 1 cliente.

**Paralelo com a fase seguinte:** inventário do agente (3.1) e assinatura digital (3.2) podem começar durante a Fase 2.

---

## Fase 3: RMM

Objetivo: o mesmo agente e a mesma interface passam a gerenciar máquinas de usuário e servidores, com vulnerabilidades e
IA de triagem.

| Etapa | Entrega | Critério de entrega | Depende de | Paralelo |
| --- | --- | --- | --- | --- |
| 3.1 | Inventário | Hardware, software, garantia e vida útil por máquina; mapa da rede com descoberta de equipamentos | Agente atual | Sim, com 3.2 |
| 3.2 | Agente e scripts confiáveis | Assinatura digital dos executáveis (resolve o bloqueio do Acronis); agente à prova de remoção; scripts assinados; scripts críticos só com dupla aprovação | Nenhuma | Sim, com 3.1 |
| 3.3 | Ferramentas de RMM | Biblioteca de scripts (lote, agendado, por alerta); ferramentas de bastidor (tarefas, serviços, registro, arquivos, terminal); instalação e remoção em massa; políticas por cliente (BitLocker, firewall do Windows, USB); remoto com senha, aceite por clique ou administrativo, configurável | 3.2 | Sim, com 3.4 |
| 3.4 | Instalador completo | Banner de acesso monitorado com nome da máquina; monitoramento; Wake-on-LAN no Windows (placa, pacote mágico, inicialização rápida) e aviso das máquinas que não acordam; despertar por vizinho, timer ou vPro, voltando ao estado anterior | 3.2 | Sim, com 3.3 |
| 3.5 | Gestão de atualizações | Anéis (Nextec, piloto, todos); janela por cliente (cartório fora do expediente e nunca em fechamento); programas de terceiros; adiar ou bloquear para todos com um clique; reinício com adiamento limitado | 3.3 | Sim, com 3.6 |
| 3.6 | Vulnerabilidades para tudo | Inventário do agente e do coletor cruzado com NVD, CISA KEV e fabricantes; prioridade por exploração e exposição; chamado no Jira; correção agendada com piloto; relatório mensal de exposição | 3.1, 2.1 | Sim, com 3.5 |
| 3.7 | IA de triagem | Agente com nome próprio; falso positivo resolvido e marcado; crítico ao analista com análise; níveis por ação (diagnosticar, corrigir e avisar, corrigir sozinho) e destrutivo com aprovação; Jev com limite de confiança, começando só registrando; feedback do analista; amostragem dos casos fechados. Aplicar a alertas de EDR, logon, disco e drivers | 3.6 | Não |
| 3.8 | Nota de risco de atualização | Nota por máquina antes de atualizar (falhas da frota, perfil parecido, problemas publicados); risco alto vai para aprovação | 3.5, 3.7 | Não |
| 3.9 | Saúde e postura | Checagem de disco e drivers; experiência do usuário; postura de segurança por máquina com relatório; backup Acronis no painel; linha de base CIS com alerta de desvio | 3.1 | Sim, com 3.10 |
| 3.10 | Resposta a incidente na máquina | Isolar a máquina com um clique, mantendo só a plataforma (obrigatório); controle de aplicativos; remoção do admin local com elevação sob demanda | 3.3 | Sim, com 3.9 |
| 3.11 | Usuário e Microsoft 365 | Autoatendimento na bandeja; integração M365 e Entra (quem está logado, licenças, bloqueio na saída); onboarding e offboarding de máquina | 3.3 | Sim, com 3.12 |
| 3.12 | API e cofre de segredos | API própria documentada com o mesmo controle de acesso; n8n e scripts buscam senhas no cofre | 1.4 | Sim, com tudo |
| 3.13 | Documentação viva | Ficha por cliente (rede, senhas no cofre, contatos, procedimentos) alimentada pelo inventário | 3.1 | Sim, com 3.11 |
| 3.14 | Segurança intermediária | Chave mestra em KMS ou HSM; teste de invasão por terceiros com achados críticos corrigidos; plano de resposta a incidente ensaiado; ambientes separados com revisão de código obrigatória; alta disponibilidade com contingência documentada | 1.1 | Sim, com tudo |

**Porta de saída:** agente assinado em produção; atualizações em anéis rodando em todos os clientes; IA de triagem há 30
dias só registrando com taxa de acerto medida; segurança intermediária concluída.

**Paralelo com a fase seguinte:** o painel do Provimento 213 (4.1) pode começar com as evidências já coletadas nas Fases
1 e 2.

---

## Fase 4: Conformidade e cliente

Objetivo: o cliente vê, aprova e comprova; o cartório tem conformidade pronta para a correição.

| Etapa | Entrega | Critério de entrega | Depende de | Paralelo |
| --- | --- | --- | --- | --- |
| 4.1 | Conformidade contínua com o Provimento 213 | Cada exigência ligada às evidências coletadas (MFA, logs, backup, atualizações, acessos); painel por cartório e relatório para a correição. Evidência: validação com 1 cartório | 1.10, 2.2, 3.5 | Sim, com 4.2 |
| 4.2 | Portal do cliente | Quem acessou, quando e por quê; aprovação de acessos opcional; relatórios de saúde, postura e exposição | Segurança intermediária (3.14) | Sim, com 4.1 |
| 4.3 | Avisos ao responsável | Notificação por WhatsApp ou e-mail a cada acesso, com quem, onde e motivo; opção de assistir ao vivo | 4.2 | Sim, com 4.4 |
| 4.4 | Aprovação pelo celular | App ou notificação para aprovar acessos com um toque, para a Nextec e para o cliente | 1.9 | Sim, com 4.3 |
| 4.5 | Perguntas em linguagem natural | Consultas sobre a auditoria (quem pode acessar, o que o fornecedor fez) respondidas a partir dos registros, respeitando a permissão de quem pergunta | 2.2, 3.12 | Sim, com 4.4 |
| 4.6 | Servidor MCP | MCP da plataforma sobre a API própria, com as mesmas regras de acesso e auditoria | 3.12 | Sim, com tudo |
| 4.7 | Credenciais vazadas | Alerta quando e-mail ou senha de cliente aparece em vazamento | 3.11 | Sim, com tudo |

**Porta de saída:** 1 cartório usando o painel do provimento numa correição ou simulação; portal do cliente em produção.

---

## Fase 5: Avançado

Objetivo: chegar ao nível dos grandes PAMs e evoluir com o que é novo.

| Etapa | Entrega | Critério de entrega | Depende de | Paralelo |
| --- | --- | --- | --- | --- |
| 5.1 | Isolamento de sessão | A credencial nunca chega ao computador do analista: a sessão passa por um intermediário que injeta a senha | 1.7, 2.1 | Não, é base de 5.2 e 5.3 |
| 5.2 | Privilégio zero permanente | Nenhuma conta com admin fixo; privilégio criado na sessão e removido no fim | 5.1 | Sim, com 5.3 |
| 5.3 | Controle fino de comandos | Lista de comandos permitidos por perfil, com bloqueio na hora | 5.1 | Sim, com 5.2 |
| 5.4 | Dupla custódia | Senhas mais críticas e o próprio cofre só abrem com duas pessoas | 1.4 | Sim, com tudo |
| 5.5 | Detecção de ataques | Ataques ao AD (roubo de credencial, golden ticket, senha usada fora do cofre) com reação: troca a senha e derruba a sessão; comportamento estranho e pontuação de risco por sessão com MFA extra | 2.2, 3.7 | Sim, com 5.6 |
| 5.6 | Caça a ameaças | Busca na frota toda por arquivo, processo ou conexão logo que sai uma ameaça nova | 3.1 | Sim, com 5.5 |
| 5.7 | Gravações pesquisáveis | Busca por comando ou texto nas gravações, abrindo o trecho do vídeo | 2.2 | Sim, com tudo |
| 5.8 | IA operando pela plataforma | Agentes de IA com identidade própria e regras do PAM; copiloto na sessão; resumo da sessão no chamado; proteção contra injeção de prompt | 3.7, 4.6 | Sim, com tudo |
| 5.9 | Simulação antes da mudança | Antes de alterar o firewall, mostrar o que abre, o que fecha e regras redundantes | 2.3 | Sim, com tudo |
| 5.10 | Segurança top | Zero trust entre componentes; builds reproduzíveis e assinados; monitoramento 24 horas; programa de recompensa por falhas; ISO 27001 e SOC 2 (decisão de negócio) | 3.14 | Itens entre si |
| 5.11 | Usuário local | Login local da própria plataforma, com MFA próprio, para quem não usa provedor externo | 1.2 | Sim, com tudo |
| 5.12 | Extrapolar | Avaliar criptografia pós-quântica no cofre, computação confidencial e passkeys para os analistas | 5.10 | Sim, com 5.4 a 5.9 |

**Porta de saída:** não há; a Fase 5 é contínua.

---

## Mapa de dependências entre fases

```
Fase 1 (1.4) -> 2.1 coletor -> 2.3 firewalls -> 5.9 simulação
Fase 1 (1.7) -> 5.1 isolamento de sessão
Fase 2 (2.2 gravação) -> 4.1 provimento, 4.5 perguntas, 5.7 busca
Fase 3 (3.14 segurança intermediária) -> 4.2 portal do cliente
Fase 3 (3.12 API) -> 4.6 MCP -> 5.8 IA pela plataforma
```

## Riscos acompanhados

- A plataforma concentra a chave de todos os clientes: nenhuma fase avança sem a sua porta de segurança.
- Rotação derrubando serviço do cliente: 1.5 é obrigatória antes de 1.6.
- Conectores por fabricante quebram com atualizações: cada conector tem teste de login e alerta de falha.
- Jev em acesso antecipado: começar só registrando; nunca agir sozinho sem limite de confiança medido.
- Volume: as fases existem para entregar valor aos poucos; não abrir etapa nova com etapa crítica pendente.

## Histórico

| Data | Mudança |
| --- | --- |
| 17/10/2026 | Criação a partir do documento de abertura |
| 17/10/2026 | Nome Sentinela; provedor de identidade plugável (OIDC e SAML) e usuário local no futuro |
