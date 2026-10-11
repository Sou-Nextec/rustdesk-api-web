# Contratos do cliente — baseline de execução

Data: 2026-10-11. Estado: parcialmente fechado; os contratos existentes abaixo são preservados. Alterações futuras de API só entram após testes integrados.

## Conexão (fechado para T4)

- Todas as entradas usam `connectDevice(id)`; `connectLink(id)` é alias compatível.
- `/api/admin/my/connect-settings` retorna envelope `{code:0,data:{mode:"off|optional|required",scheme:"nextec-connect"}}`. Falha não transforma mode em off.
- Quando obrigatório, `/api/admin/my/connect-note` deve aceitar o chamado antes da preparação. Falha impede abrir o app.
- `/api/admin/my/connect-link?id=...` é a única fonte do link autorizado; resposta sem sucesso ou URL não abre alternativa.
- A abertura preserva o gesto final requerido pelo navegador. O painel não recebe resultado da autenticação do aplicativo e não pode alegar implementar retry dessa autenticação sozinho.

## Identidade (fechado para T1)

`Get-NextecInstalledClient` devolve `ExePath`, `ServiceName`, `ServiceAccount`, `ConfigRoot`, `PeerId`, `ComponentVersion` conforme descoberta comprovável. Campo indisponível não é inventado. Nesta primeira entrega, as funções ficam no agente standalone para preservar o canal de download atual; a extração para módulo compartilhado só ocorre junto do empacotamento T5.

Serviço/executável concorrente produz `identity_conflict`. Respeitar nome personalizado. Nenhuma escolha pelo primeiro serviço encontrado ou preferência automática por RustDesk original.

No upstream 1.5.0, `--password` usa IPC no contexto instalado/root; pode imprimir erro sem exit code não zero. Alterar APPDATA e verificar exit code sozinho não é prova de aplicação no serviço real. Teste com double e teste em serviço real são evidências distintas.

## Cadastro (gate ainda aberto)

API existente cria em sysinfo; heartbeat ausente não cadastra. Upstream 1.5.0 `src/hbbs_http/sync.rs` envia heartbeat a cada 15s e usa cache de sysinfo/hash. A resposta com `sysinfo` presente limpa esse cache e pede novo envio. Essa capacidade foi comprovada na leitura completa do parser da resposta.

Para ID/UUID válidos sem registro, retornar `{ "sysinfo": true }`; o heartbeat não cria o cadastro, concede senha ou altera proprietário. ID/UUID vazios ou UUID divergente de registro existente não recebem essa recuperação. Revogação de agente/login segue independente; não liberar mudança pública de UUID. Tombstones e autenticação criptográfica são evolução adicional, não comprovada pela recuperação de inventário.

## Rotação (gate ainda aberto)

Preparação/aplicação/confirmação precisam identificar a mesma operação e versão. Forma futura: `operation_id` opaco e versão monotônica; confirmar operação antiga não promove senha pendente mais nova. A compatibilidade com agente antigo precisa de negociação e testes antes de alterar respostas.

Não confiar na CLI só pelo exit code. Não reiniciar o serviço para cada rotação. Uma sessão existente deve sobreviver; testar isso em máquina real antes de declarar suporte.

## Linux (capacidade encontrada, homologação pendente)

RustDesk 1.5.0 possui `--terminal`, `src/server/terminal_service.rs` e páginas Flutter de terminal. Isso comprova presença no código, não funcionamento no pacote Nextec nem autenticação do usuário Linux. Manter credenciais do sistema no cliente, sem enviá-las ao painel ou armazená-las aqui.

## Identificação de artefatos

Produto `nextec-connect`; versão-base, pacote, API e componentes separados; hash e assinatura mantidos. Não prometer atualização de cópia antiga de script por atualizar somente GitHub ou container.
