# Cadastro temporário por máquina

A API do patch 0028 prepara o provisionamento sem incluir chave geral em MSI/EXE/DEB. Esta parcela é a fundação da API; ainda não implementa o coordenador, a entrega protegida ao cliente ou a ativação automática das tarefas.

Um administrador autenticado solicita POST `/api/admin/nextec/secrets/bootstrap` com `{id,client_id?}` para um dispositivo já inventariado, com UUID e cliente/grupo existentes. O servidor devolve código aleatório de uso único e validade de 15 minutos, gravando apenas seu hash. Não emite código para agente já ativo.

O coordenador autorizado entrega esse código à máquina por canal protegido. Não colocar em URL, argumentos de processo, pacote público, CI ou logs. A máquina solicita POST `/api/nextec/agent/bootstrap` com `{bootstrap,id,uuid}`. A API confere expiração, identidade e grupo atuais, consome o código atomicamente e devolve um token exclusivo do dispositivo. UUID não é segredo nem prova criptográfica isolada: a autorização depende do código temporário.

O consumo não substitui token ativo. Revogar o agente invalida também códigos ainda não consumidos. Falha de cadastro reverte o consumo. A auditoria registra emissão/cadastro sem credenciais. Agentes antigos continuam compatíveis com o cadastro legado durante a migração.

Validação: testes Linux/CGO de service, controller API, router e controller admin passaram em container isolado no APP03, incluindo prazo, replay, UUID/grupo divergentes, agente ativo, revogação de código e acesso administrativo. Homologação e integração do coordenador ainda são pendentes.
