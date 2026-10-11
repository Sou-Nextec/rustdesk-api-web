# Roadmap do cliente e acesso Nextec

Data: 2026-10-11. Estado: planejamento documentado localmente; não implementado, publicado ou implantado nesta etapa.

## P0 — Estabilizar e qualificar para produção

Executar [plano de estabilização](../docs/superpowers/plans/2026-10-11-estabilizacao-cliente.md) seguindo [escopo aprovado](../docs/superpowers/specs/2026-10-11-cliente-confiavel.md).

- [ ] Identidade única do cliente/serviço, preservada entre EXE/MSI/reparo/upgrade.
- [ ] Cadastro automático recuperável, sem duplicatas ou reativação indevida de máquinas revogadas.
- [ ] Agentes e atualizador incorporados e reparáveis; sem script manual após instalação normal.
- [ ] Senha rotacionada confirmada no serviço correto; analista autorizado conecta sem copiar/colar.
- [ ] Rotação mantém sessão; novas conexões usam senha vigente; revogação e encerramento são ações distintas.
- [ ] Linux: terminal real compatível, com usuário e senha do servidor inseridos pelo analista.
- [ ] Saúde operacional visível, testes integrados em CI e piloto real antes de expansão.
- [ ] Assinatura automatizada com chave protegida; rollout confirmado por versão/digest e funcionamento.

## P1 — Operação simples e prevenção

- [ ] Diagnóstico e reparo seguro de serviço, agente, identidade e API.
- [ ] Políticas por servidor, estação, analista e suporte avulso; IDs permanentes para clientes/grupos.
- [ ] Atualizações em piloto, expansão progressiva, pausa automática por falhas e recuperação compatível com assinatura/anti-replay.
- [ ] Painel de saúde da frota, versões antigas e alertas acionáveis.
- [ ] Histórico persistente de gerações, progresso por etapas real e downloads no painel.
- [ ] Importação direta RDGen → Atualizações com autenticação, idempotência e hashes; reutilizar o plano existente do catálogo sem duplicar implementação.
- [ ] Responsividade, logos claro/escuro, prévia, ajuda nos campos e separação entre canal nightly e tema.

## P2 — Acesso e atendimento

- [ ] Permissões distintas para tela, terminal, arquivos e elevação.
- [ ] Acesso temporário por usuário/grupo com expiração.
- [ ] Auditoria unificada por atendimento/sessão, sem senhas em logs.
- [ ] Transferência de atendimento entre analistas.
- [ ] Nome e foto do analista consistentes entre app e web; respeitar capacidades do protocolo.
- [ ] Evoluir terminal Linux dentro da mesma experiência, após homologação inicial.

## P3 — PAM, identidade e continuidade

- [ ] Avaliar PAM existente para cofre, rotação, credenciais temporárias e acesso individual ao sistema operacional.
- [ ] Integrar PAM à identidade IAM/Entra e às permissões do painel; privilégios mínimos e elevação auditável.
- [ ] Escolher mecanismo de acesso Linux: certificados SSH temporários, intermediação de sessão ou cofre conforme PAM selecionado; não compartilhar root por padrão.
- [ ] Credenciais temporárias para sessão remota quando suportadas pelo motor; revogação efetiva além de ocultação no painel.
- [ ] Backup com restauração testada, proteção de chaves, continuidade de API/ID/relay e plano de desastre.
- [ ] Avaliar RustDesk Pro em prova de conceito se reduzir manutenção sem perder requisitos Nextec.

## Acompanhamento

Cada item deve ter responsável, dependências, teste de aceite e evidência. Marcar concluído somente quando o nível necessário (local, CI, piloto ou produção) estiver confirmado. Registrar bugs adiados com reprodução e risco, sem fechá-los como resolvidos.

O plano anterior de catálogo está em `auditoria/PLANO-CATALOGO-INSTALADORES.md` na pasta agregadora do workspace; durante a execução, trazer a especificação aplicável para o repositório responsável e atualizar links. Não criar dependência permanente de arquivo fora do Git.
