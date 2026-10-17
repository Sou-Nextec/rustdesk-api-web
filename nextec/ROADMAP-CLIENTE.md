# Roadmap do cliente e acesso Nextec

Data: 2026-10-12. Estado: execução parcial; ver evidências em [plano de estabilização](../docs/superpowers/plans/2026-10-11-evidencias-cliente.md). Merges e CI passaram para cenários descritos ali; produção plena e piloto ainda não comprovados.

## P0 — Estabilizar e qualificar para produção

Executar [plano de estabilização](../docs/superpowers/plans/2026-10-11-estabilizacao-cliente.md) seguindo [escopo aprovado](../docs/superpowers/specs/2026-10-11-cliente-confiavel.md).

- [x] Código/CI e teste de instalação MSI no runner Windows cobrem instalação, reparo e desinstalação; identidade única preservada entre esses cenários conforme PR #34. Upgrade e outras variantes ainda dependem da cobertura registrada no plano.
- [x] Código/CI do bootstrap recuperável, token proposto protegido e revogação sem reativação automática conforme PR #64; piloto de frota continua pendente.
- [x] Agentes/coordenadores e atualizador incorporados e reparáveis nos cenários de instalação/reparo testados no runner Windows. Verificar separadamente cobertura de upgrade e demais plataformas.
- [x] API de bootstrap e ativação passaram os checks dos PRs; a rotação no serviço correto está implementada nos cenários automatizados. A confirmação de senha em instalação cliente ainda aguarda piloto e evidência de sessão real.
- [ ] Confirmar em piloto que a rotação mantém sessão ativa e que nova conexão usa senha vigente; revogação e encerramento permanecem ações distintas.
- [ ] Linux: validar deep link nativo `{scheme}://terminal/{ID}?password=...` no pacote Nextec. RustDesk 1.5.0 abre modo terminal com senha da conexão RustDesk, mas no Linux o shell usa a conta do processo RustDesk; não valida credenciais PAM do analista. Login individual Linux fica para avaliação do PAM ou mecanismo futuro apropriado.
- [ ] Saúde operacional e piloto de servidor cliente com versão/digest registrados antes de expansão. Checks verdes e APP03 healthy são evidências de CI/ambiente, não do piloto cliente.
- [ ] Assinatura de release usando a chave real protegida e rollout confirmado por versão/digest e funcionamento. Disponibilidade da chave pública no RDGen não comprova assinatura real.

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

> Substituído em 17/10/2026 por `nextec/plataforma/ROADMAP.md`. Itens mantidos aqui só como histórico.

- [ ] Avaliar PAM existente para cofre, rotação, credenciais temporárias e acesso individual ao sistema operacional.
- [ ] Integrar PAM à identidade IAM/Entra e às permissões do painel; privilégios mínimos e elevação auditável.
- [ ] Escolher mecanismo de acesso Linux: certificados SSH temporários, intermediação de sessão ou cofre conforme PAM selecionado; não compartilhar root por padrão.
- [ ] Credenciais temporárias para sessão remota quando suportadas pelo motor; revogação efetiva além de ocultação no painel.
- [ ] Backup com restauração testada, proteção de chaves, continuidade de API/ID/relay e plano de desastre.
- [ ] Avaliar RustDesk Pro em prova de conceito se reduzir manutenção sem perder requisitos Nextec.

## Acompanhamento

Cada item deve ter responsável, dependências, teste de aceite e evidência. Marcar concluído somente quando o nível necessário (local, CI, piloto ou produção) estiver confirmado. Registrar bugs adiados com reprodução e risco, sem fechá-los como resolvidos.

O plano anterior de catálogo está em `auditoria/PLANO-CATALOGO-INSTALADORES.md` na pasta agregadora do workspace; durante a execução, trazer a especificação aplicável para o repositório responsável e atualizar links. Não criar dependência permanente de arquivo fora do Git.
