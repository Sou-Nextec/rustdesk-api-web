# Estabilização do cliente Nextec — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. O usuário prefere dois Luna em paralelo, com contexto mínimo; não iniciar implementação apenas por ler este arquivo.

**Goal:** Qualificar o ciclo completo do cliente e remover a necessidade de reparos manuais recorrentes.

**Architecture:** Um coordenador de gerenciamento usa a identidade real do serviço para cadastro, políticas, senha e atualização. Reutilizar componentes existentes; separar estados e tornar operações idempotentes. Não reescrever o motor RustDesk nem introduzir PAM nesta fase.

**Tech Stack:** Vue 3, Go/API lejianwen com patches Nextec, PowerShell, Django/RDGen, RustDesk Rust/Flutter, GitHub Actions, Docker e systemd.

**Spec:** [Escopo e critérios](../specs/2026-10-11-cliente-confiavel.md).

## Global Constraints

- Builds permanecem no GitHub; manter caches e validações existentes.
- Produção: Windows Server 2022, Windows de estação suportados e uma distribuição Linux explicitamente homologada.
- Rotação configurável, incluindo 15 minutos; sessão autenticada permanece aberta.
- Terminal Linux com usuário/senha inseridos pelo analista; PAM futuro.
- Não alterar ID, proprietário ou UUID para contornar erros; não remover assinatura para simplificar publicação.
- Nenhuma chave privada no navegador, repositório ou pacote distribuído.
- Separar versão-base RustDesk, pacote Nextec, gerador, agentes e API.
- Não misturar mudanças locais preexistentes: partir de referências remotas verificadas em worktrees dedicadas durante a execução.

## Review Focus

- Perfis SYSTEM/LocalService e instalações concorrentes: T1 prova que todos os componentes usam o mesmo serviço.
- Exclusão versus revogação: T2 recupera inventário ausente sem reativar credencial revogada.
- Falha entre aplicar senha e confirmar: T3 preserva operação recuperável sem confirmação obsoleta.
- Conexão no instante da rotação: T4 não expõe senha e não derruba sessão autenticada.
- Pacote antigo ou parcialmente instalado: T5/T6 verificam upgrade real, identidade e componentes reportados.

## Repositórios e propriedade

- `Sou-Nextec/rustdesk-api-web`: painel e patches da API realmente aplicados por `nextec/docker/Dockerfile`.
- `Sou-Nextec/rustdesk-api`: código Go de referência/desenvolvimento; alterações devem chegar à cadeia de patches consumida pelo build, não apenas a um checkout solto.
- `Sou-Nextec/rdgen`: empacotamento, gerador e workflows do cliente.
- Não inferir implantação pela presença de arquivo local. Registrar commit remoto, imagem, digest implantado e versões do cliente testado.
- Agente A possui scripts de gerenciamento e empacotamento; agente B possui patches da API e painel. Arquivos de workflow compartilhados têm um único responsável definido na T0.

## T0 — Baseline, contratos e provas iniciais (sequencial)

**Files:** ler `nextec/docker/Dockerfile`, `nextec/backend/0008-cofre-de-senhas.patch`, `0012-politicas-e-sessoes.patch`, `0019-autorizacao-e-identidade.patch`, `src/nextec/connect.js`; no RDGen, `.github/workflows/generator-windows.yml` e `.github/scripts/test-msi-install.ps1`.

- [ ] Registrar referências remotas, PRs pendentes, patches aplicados, pacote afetado e digest em produção, preservando alterações locais.
- [ ] Reproduzir ID divergente, cadastro excluído ausente, senha recusada e agente/tarefa ausente em ambiente isolado; coletar logs sanitizados.
- [ ] Testar terminal real na versão-base estável. Se ausente, documentar decisão entre versão estável compatível e componente SSH integrado; não escolher nightly automaticamente.
- [ ] Fixar contrato compatível de cadastro/saúde e operação de senha, com exemplos JSON em `docs/superpowers/specs/cliente-contratos.md`. Preservar rotas existentes; novas respostas são negociadas por capacidade/versão.
- [ ] Fixar códigos `identity_conflict`, `registration_missing`, `agent_missing`, `credential_pending`, `api_unreachable`, `unsupported_capability`; rejeições não viram sucesso HTTP silencioso.
- [ ] Definir operação de senha com ID e versão: preparação devolve operação; confirmação identifica exatamente operação aplicada. Credencial fica fora de respostas de saúde.
- [ ] Definir identificação do artefato: produto, versão-base, versão do pacote, versão dos componentes e hashes.

**Entrega:** baseline reproduzível e contrato congelado. Só então iniciar A/B; qualquer mudança de contrato volta à coordenação.

## T1 — Identidade única e reparo automático (Luna A)

**Files:** modificar `nextec/atualizacao/Agente-Senha-Nextec.ps1`, `nextec/atualizacao/Instalar-Nextec.ps1`; estender `nextec/testes/agente.ps1` e `updates-fresh.ps1`.

**Interfaces:** consome contrato T0; produz descoberta de serviço/executável/identidade usada por cadastro, senha e atualização. Criar `Get-NextecInstalledClient` em `nextec/atualizacao/Cliente-Nextec.ps1`, retornando `ExePath`, `ServiceName`, `ServiceAccount`, `ConfigRoot`, `PeerId` e `ComponentVersion`; conflito termina com `identity_conflict`.

- [ ] Criar testes `Identity_ServiceProfile`, `Identity_MultipleInstalls`, `Identity_CustomAppName` e `Repair_PreserveIdentity`; afirmar mesmo ID e nenhum cadastro adicional.
- [ ] Executar casos reproduzidos contra scripts antigos e registrar falha esperada.
- [ ] Implementar descoberta comum e reparo idempotente; confirmar comportamento CLI/IPC do cliente real, sem depender somente de alteração de APPDATA.
- [ ] Proteger diretório, scripts e configuração executados como SYSTEM; validar permissões e ausência de segredos em logs.
- [ ] Rodar testes de scripts e de serviço real; revisar e fazer commit somente da tarefa.

## T2 — Cadastro recuperável e saúde (Luna B)

**Files:** Go `http/controller/api/peer.go`, `index.go`, `service/peer.go`, controladores Nextec; transportar mudanças para novo `nextec/backend/0023-cliente-cadastro-saude.patch`; testes Go no patch e `nextec/testes/ids.ps1`.

**Interfaces:** consome T0/T1; rotas `/api/sysinfo` e `/api/heartbeat` mantêm compatibilidade. Saúde usa ID confirmado e versão dos componentes; não permite alterar vínculo com cliente pelo payload público.

- [ ] Criar testes `RegistrationMissing_Recovery`, `RevokedDevice_NotReenrolled`, `UUIDMismatch_Denied`, `RepeatedEnrollment_NoDuplicate` e `GroupAssignment_NotSpoofable`.
- [ ] Rodar testes sobre API atual, registrando o comportamento que reproduz o bug.
- [ ] Implementar recuperação compatível com o protocolo real; se o cliente não reage à resposta, coordenador envia o cadastro. Não inventar que qualquer chave JSON induz sysinfo no upstream.
- [ ] Tornar cadastro autenticado repetível e publicar saúde sanitizada; definir arquivo/política de revogação conforme T0.
- [ ] Aplicar toda a cadeia de patches sobre a versão-base, rodar `go test ./...` no estágio Linux usado pelo Dockerfile e validar API isolada.

## T3 — Rotação transacional e continuidade (B API, depois A agente)

**Files:** `service/nextec_secret.go`, `http/controller/api/nextec_agent.go`, novo `nextec/backend/0024-cliente-rotacao.patch`, `nextec/testes/cofre.ps1`, `agente.ps1` e script de senha.

**Interfaces:** preparação/aplicação/confirmação obedecem operação e versão T0; API só entrega senha ativa confirmada a analista autorizado. Manter compatibilidade controlada com agentes antigos.

- [ ] Criar testes `Confirm_StaleOperationDenied`, `ApplySuccess_ConfirmTimeoutRecovered`, `ApplyFailure_ActiveUnchanged` e `Rotate_ExistingSessionSurvives`.
- [ ] Executar e registrar falhas antes da correção.
- [ ] API implementa confirmação idempotente da operação e recuperação da pendência; agente aplica e confirma a mesma operação sem regenerar senha a cada repetição.
- [ ] Validar senha no serviço correto e sessão real aberta através de uma rotação de 15 minutos; conferir nova conexão usando senha vigente.
- [ ] Rodar testes Go/PowerShell e registrar evidência real de sessão, não apenas exit code zero.

## T4 — Uma conexão em todas as telas (Luna B)

**Files:** `src/nextec/connect.js`, `src/utils/peer.js`, telas que chamam conexão, `src/nextec/views/Secrets.vue`, `Devices.vue`, `Updates.vue`; criar `nextec/testes/connect.spec.js` e runner/CI de teste frontend necessários.

**Interfaces:** `connectDevice(id)` permanece ponto de entrada; `connectLink(id)` delega à mesma preparação. Senha nunca entra na telemetria; exigir política/auditoria não pode ser ignorado em fallback.

- [ ] Testar favoritos, listagens antigas, busca e telas Nextec usando a mesma autorização; teste nega senha a usuário não autorizado.
- [ ] Testar falha da API sem downgrade silencioso, rotação concorrente e revogação seguida de encerramento explícito.
- [ ] Unificar preparação e abertura, preservando gesto do usuário requerido pelo navegador; oferecer diagnóstico e modo compatível de terminal Linux aprovado na T0.
- [ ] Exibir estados separados e validar desktop/tablet/mobile; não implementar senha automática do sistema Linux.
- [ ] Executar testes frontend e `npm run build`; comprovar conexão real pelo protocolo registrado do app.

## T5 — Instalação e atualização completas (Luna A)

**Files:** RDGen `.github/scripts/build-msi.ps1`, `test-msi-install.ps1`, `test-setup-exe.ps1`, `.github/workflows/generator-windows.yml`; agentes em `nextec/atualizacao/`; Linux `empacotar-deb-atualizador.sh`, serviço/timer existentes.

**Interfaces:** reutiliza identidade T1 e cadastro T2; EXE portátil não instala componentes; EXE instalado e MSI têm mesmo produto e cadeia de atualização assinada.

- [ ] Criar regressões `Install_AllComponents`, `Portable_NoPrivilegedTasks`, `Upgrade_PreserveId`, `EXEToMSI_PreserveConfig`, `SignedAgentUpgrade_RejectTampering`.
- [ ] Executar testes contra pacote afetado e guardar logs MSI com erro causal, sem tratar 1603 como causa raiz.
- [ ] Incorporar componentes e cadastro autorizado; sem segredo global em pacote público. Offline conclui instalação local com gerenciamento pendente e recupera quando houver rede.
- [ ] Incluir atualização assinada do coordenador/agentes, evitando cópia local permanentemente antiga.
- [ ] Testar reparo, reboot, ausência de usuário logado, execução SYSTEM e timer Linux; aceitar retorno de reboot requerido quando aplicável.
- [ ] Validar EXE e MSI produzidos pelo workflow real, com hashes e versões; realizar upgrade de pacote antigo em VM isolada.

## T6 — Assinatura e rollout verificável (Luna A; revisão forte)

**Files:** `nextec/atualizacao/Manifesto-Connect.ps1`, publicadores existentes no RDGen; workflows de imagem/atualização dos dois repos; documentação de implantação.

- [ ] Testar pacote adulterado, manifesto vencido, sequência antiga e atualização parcial; instalação deve ser recusada/recuperável.
- [ ] Automatizar assinatura usando mecanismo autorizado do monitoramento após confirmar onde está a chave e como o serviço recebe pedidos; navegador solicita publicação, nunca recebe chave privada.
- [ ] Separar alteração de script, imagem e pacote em gatilhos explícitos; documentar quais artefatos chegam a máquinas antigas.
- [ ] Checks executam teste de integração Windows/API, além de smoke do container; usar VM isolada Windows Server 2022 quando runner hospedado não cobre esse sistema.
- [ ] Criar PRs por unidade testável, anexar evidências e mesclar somente com checks necessários verdes.
- [ ] Validar piloto: digest em execução, versão do painel, cadastro, senha, conexão e atualização; ampliar só após sucesso. Manter pacote de recuperação e backup fora do Git.

## Paralelismo, modelos e custo

- T0 sequencial; A executa T1 e prepara T5, B executa T2 e prepara T4.
- T3 exige API primeiro e agente depois; T5 depende dos contratos de T1/T2/T3. T6/aceite final são integrados.
- Luna `high`: scripts, UI, embalagem e testes com contrato fechado. Luna `xhigh`: integração/diagnóstico difícil se necessário. Não iniciar tudo em `max`.
- Sol `high`/`xhigh`: revisão concentrada em identidade, autorização, rotação e atualização privilegiada. Astra somente se a causa continuar inconclusiva ou envolver mudanças profundas de protocolo.
- Tudo no Luna é viável como estratégia de execução, mas não garante acerto nem menor consumo total; risco técnico define a revisão. Não há benchmark de tokens/tempo deste plano.
- Dois agentes não dividem o custo pela metade: existe overhead. Enviar apenas spec, contrato, tarefa, arquivos e resultados necessários; não copiar todo o chat. Um responsável integra e não reanalisa tarefas concluídas.
- Cada agente relata arquivos, teste que falhava, teste que passou, limites e dependências. Sem builds duplicados ou edição concorrente do mesmo arquivo.

## Evidências e bloqueios externos

- [ ] Registrar cada tarefa em `docs/superpowers/plans/2026-10-11-evidencias-cliente.md`: pendente/local/CI/merge/piloto/produção.
- [ ] Confirmar acesso SSH funcional a APP03, stack correta, permissão persistente da chave pública e configuração Cloudflare das rotas API/WSS.
- [ ] Disponibilizar VM Server 2022 e Linux homologado com credenciais de teste fora dos logs/Git.
- [ ] Confirmar serviço/chave de assinatura do monitoramento e acesso mínimo do publicador. Não confundir com certificado Authenticode.
- [ ] Concluir todos os critérios da spec antes de anunciar pronto para produção.
