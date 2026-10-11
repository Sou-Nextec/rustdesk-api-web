# Evidências — plano de estabilização do cliente

Plano: `2026-10-11-estabilizacao-cliente.md`. Estado atualizado durante execução; pendências não são aprovadas por silêncio.

## Baseline

- Master API/painel: `bd2bb79672252f2bfce91568f4e38ebc38f4a4c3`.
- Documentos commitados no checkout original: `bfd5bf3`; cherry-pick limpo: `23b8ce1`; commit publicado no GitHub: `83b4b4160e30d02ce6809d4ddd02fcc4417d2cec`.
- Implementação isolada: branch `codex/cliente-estabilizacao`, worktree `cliente-estabilizacao`.
- Checkout original possui alterações preexistentes; nenhuma incorporada por arrasto.
- Docker Desktop: daemon Linux indisponível nesta execução.
- SSH APP03: acesso restabelecido em 2026-10-11 usando `ssh root@app03` aprovado pelo usuário.
- Git/gh: credencial de escrita indisponível. GitHub conectado permite criar branch; usar connector para publicar commits revisáveis.
- Código oficial RustDesk 1.5.0: terminal e CLI presentes; homologação real ainda não executada. Parser do heartbeat reconhece `sysinfo` e limpa cache de cadastro; API atual não devolve esse sinal para registro ausente.
- Build local Vue bloqueado pelo Windows Defender ao carregar binário nativo Rollup; proteção não foi desativada. Validar build Linux em CI.

## Decisões de integração

| Tarefas | Interface/arquivo comum | Decisão |
| --- | --- | --- |
| T1/T5 | descoberta e pacote de scripts | T1 cria módulo comum; T5 deve incorporar módulo ao MSI/EXE antes de release. |
| T2/T3 | controladores/serviços Go | Não executar alterações concorrentes nesses arquivos; fechar contrato e regressões primeiro. |
| T3/T4 | senha confirmada/link | T4 preserva API existente; não promete observar autenticação de aplicativo externo. |
| T5/T6 | workflow e payload | Um responsável integra workflows; assinatura não é removida para contornar implantação. |
| T0 | baseline reproduzida | Inspeção de fonte concluída; reprodução com serviço/VM ainda pendente. |
| T1 | identidade/testes | Luna A: scripts e testes offline; prova real de serviço continua obrigatória. |
| T2 | cadastro/saúde | Pendente; não reativar cadastro revogado a partir de heartbeat público. |
| T3 | rotação | Pendente; exigir operação/versão e compatibilidade. |
| T4 | conexão | Luna B: módulo com testes comportamentais; navegador real ainda pendente. |
| T5 | instalação | Pendente até integração da identidade e contratos API. |
| T6 | assinatura/rollout | Pendente; CI e homologação necessárias. |

Ruling: tarefas T1 e a parcela independente T4 podem avançar com contratos existentes — não dependem de nova API — custo se incorreto: revalidar integração, sem publicação de pacote.

Ruling: nomes de patch 0023/0024 do plano já estão ocupados na master atual; próximo patch livre começa em 0026 — preservar ordem cumulativa — custo: atualizar referências na execução.

Ruling: a versão-base 1.5.0 tem terminal; não usar nightly para obter essa função — funcionamento do pacote ainda precisa de teste Linux.

Ruling: descoberta fica no script standalone nesta entrega — painel atualmente distribui um único arquivo — evitar dependência ausente na instalação e extrair módulo somente com T5.

## Testes locais da primeira parcela

- Conexão: 8 testes Node passaram (regras ausentes, API indisponível, chamado obrigatório/optional, cancelamento, link autorizado e acesso negado).
- Identidade/CLI/ACL: 9 testes PowerShell 5.1 passaram; retorno numérico embutido em mensagem de erro é recusado. Seleção IPC sem alterar APPDATA. ACLs verificadas com doubles: substituição da DACL antiga por SYSTEM/Administrators via SID e rejeição de redirecionamentos antes das gravações.
- Senha CLI: retorno zero sem `Done!` é recusado antes de confirmar no painel. Contrato verificado no código upstream 1.5.0; serviço real pendente.
- Registro do atualizador: teste de contrato com doubles de tarefa/ACL passou.
- Manifesto: 5 testes existentes passaram com chave descartável e pasta temporária isolada no worktree; incluindo contrato Windows PowerShell, adulteração e repetição.
- Teste de recuperação do heartbeat incluído no patch cumulativo 0026; aplicação sobre 0001–0025 e round-trip `git apply --check` passaram. `gofmt` passou e o teste compilou, mas SQLite impediu execução no toolchain Windows sem CGO. Execução real depende de CI Linux.
- Revisão independente encontrou ACL explícita antiga com escrita para usuário comum; implementação foi corrigida para recriar DACL protegida da raiz e arquivos, sem depender de nomes localizados de grupos. Revalidação da revisão registrada no PR.

Estas correções não concluem a instalação automática de todos os componentes, a confirmação transacional por versão, o terminal Linux real nem a homologação do pacote.

## Aceite

- [ ] Testes locais de identidade/conexão e build frontend.
- [ ] CI com os testes novos no commit publicado.
- [ ] API/Windows Server 2022 integrados e teste Linux.
- [ ] Rotação mantém sessão e nova conexão usa senha confirmada.
- [ ] Pacote novo preserva identidade e instala todos os componentes.
- [ ] Piloto e versão/digest implantados comprovados.

Nenhum destes itens pode ser apresentado como produção pronta apenas pela conclusão de testes unitários.

## Continuação: PR 61 e APP03

- PR 61 mesclado com os três workflows verdes, master `0cc101bd2e7125a53ba8172097671d169ea8aa70`.
- Workflow master `38182429648`: imagem publicada e webhook Portainer concluídos.
- Container painel passou de `4e76332...` para `fd2717792358c378cb0eced094fcd7ae5687f891a38502dcb031a6a001b2cc63`, iniciou às 23:00:59 UTC e ficou healthy.
- RDGen e servidor ID/relay também healthy; o painel executa apenas apimain, o container rustdesk-servidor executa hbbs/hbbr.
- Chave pública host/container: modo 0644 root:root, legível pelo RDGen uid 1000 após redeploy. Não exibida chave privada.
- Teste live com ID sintético confirmou `sysinfo:true`, nenhuma criação no inventário e nenhuma concessão de acesso.
- Pelo Cloudflare: chamadas sem User-Agent (formato do cliente RustDesk), com RustDesk e PowerShell passaram. User-Agent padrão Python recebeu 403; não representa bloqueio geral do cliente. Não foram relaxadas regras do Cloudflare.
- Backup consistente e privado: `/opt/rustdesk-nextec/backups/pre-cliente-transacao-20261011-200006`; arquivos 0600 e diretório 0700.
- T3: journal protegido, negociação v1 e confirmação por operação em implementação; sete testes PowerShell novos passaram. Testes Go e integração isolada ainda obrigatórios.
- T5 Windows: payload de agente no MSI/EXE em preparação, sem credencial global; bootstrap e ativação automática segura continuam gate aberto.

## T3: validacao transacional

- PowerShell 5.1: nove casos passaram, incluindo proposta divergente recusada antes de aplicar a senha.
- Linux/CGO no APP03, container isolado CPU1/RAM1200m sem volumes de producao: service e http/controller/api passaram.
- A primeira execucao encontrou fixture com GORM default:true que ignorava Enabled:false; fixture agora grava e verifica explicitamente o estado persistido. Reexecucao verde.
- Testes de revogacao entre autenticacao e operacao verificam que token revogado nao recebe pendencia nem confirma senha.
- Sessao real Windows Server 2022 e rotacao de 15 minutos continuam pendentes; testes nao equivalem a piloto.
