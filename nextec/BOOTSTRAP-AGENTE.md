# Cadastro temporário por máquina

A API do patch 0028 prepara o provisionamento sem incluir chave geral em MSI/EXE/DEB. Esta parcela é a fundação da API; ainda não implementa o coordenador, a entrega protegida ao cliente ou a ativação automática das tarefas.

Um administrador autenticado solicita POST `/api/admin/nextec/secrets/bootstrap` com `{id,client_id?}` para um dispositivo já inventariado, com UUID e cliente/grupo existentes. O servidor devolve código aleatório de uso único e validade de 15 minutos, gravando apenas seu hash. Não emite código para agente já ativo.

O coordenador autorizado entrega esse código à máquina por canal protegido. Não colocar em URL, argumentos de processo, pacote público, CI ou logs. A máquina solicita POST `/api/nextec/agent/bootstrap` com `{bootstrap,id,uuid}`. A API confere expiração, identidade e grupo atuais, consome o código atomicamente e devolve um token exclusivo do dispositivo. UUID não é segredo nem prova criptográfica isolada: a autorização depende do código temporário.

O consumo não substitui token ativo. Revogar o agente invalida também códigos ainda não consumidos. Falha de cadastro reverte o consumo. A auditoria registra emissão/cadastro sem credenciais. Agentes antigos continuam compatíveis com o cadastro legado durante a migração.

Validação: testes Linux/CGO de service, controller API, router e controller admin passaram em container isolado no APP03, incluindo prazo, replay, UUID/grupo divergentes, agente ativo, revogação de código e acesso administrativo. Homologação e integração do coordenador ainda são pendentes.

## Inscrição global (agente do cliente)

O instalador global traz `inscricao.json` (`{v,painel,chave}`) ao lado dos scripts. O coordenador o copia para `%ProgramData%\Nextec\Acesso\inscricao.json` (somente SYSTEM e Administradores) ou, no Linux, para `/var/lib/nextec-connect/inscricao.json` (0600). Sem `bootstrap.json` e sem `agente-senha.json`, o agente chama `POST /api/nextec/agent/self-enroll` com `{enroll_key,id,uuid,proposed_token}` e a máquina entra como pendente; o administrador a atribui depois no painel.

O `uuid` é o mesmo que o RustDesk 1.5.0 informa no heartbeat e no sysinfo: base64 padrão (com preenchimento) do `MachineGuid` (Windows, visão de 64 bits do registro) ou de `/var/lib/dbus/machine-id`, com fallback para `/etc/machine-id` (Linux), sem espaços nas pontas.

Respostas: 200 grava o token e registra a tarefa; 404 e 429 repetem com recuo de 5, 10, 20, 40 e 60 minutos usando o mesmo token proposto; 401 e 409 esperam 6 horas e tentam de novo sozinhos (o fluxo com `bootstrap.json` continua valendo, e uma chave nova no MSI reabilita na hora); 403 para por 24 horas. Enquanto `/agent/sync` devolver `pending_approval` sem `managed`, o agente só registra "aguardando atribuição" e nunca rotaciona.

## Recuperação automática (2.11.16)

- Credencial local ilegível, de outro ID (app reinstalado) ou substituída por autorização nova do painel vai para `agente-senha.json.anterior`, e a inscrição recomeça. O log registra `agent_config_unreadable`, `identity_changed` ou `agent_config_replaced`.
- O agente de senha que recebe 401 em 3 ciclos seguidos aposenta a própria credencial do mesmo jeito. Um 401 isolado não muda nada.
- Autorização (`bootstrap.json`) inválida ou de outra máquina é descartada (`bootstrap_discarded`, `identity_conflict`) em vez de ficar presa.
- O serviço é localizado pelo marcador do instalador (`HKLM\SOFTWARE\Nextec\Agente`, `InstallDir`) ou pela configuração em `ServiceProfiles\LocalService` (onde o RustDesk grava quando roda como LocalSystem).
