# Patch 0019: autorização e identidade dos dispositivos

Estado: correção preparada para PR, validada localmente; a CI deve passar antes do merge. Validação na VPS pendente.

O cofre passa a verificar o dono real do dispositivo ou uma lista de cliente mantida por administrador, com regra de
compartilhamento e grupo real do dispositivo correspondentes. A lista usa o mesmo nome que Acessos por cliente:
`Cliente: <nome do grupo>`. Listas pessoais e listas arbitrárias continuam permitindo conexão manual, sem a senha do cofre.
Ao renomear clientes, mantenha a lista correspondente sincronizada em Acessos por cliente. Sem correspondência, a senha
automática é recusada. Uma lista editável não concede senhas de outro cliente por receber um ID digitado pelo usuário.

O endpoint pessoal de atualização de listas preserva o dono original. Comandos do hbbs/hbbr exigem administrador em todas
as quatro rotas. `sysinfo` exige ID e UUID e recusa mudança do UUID de um cadastro existente. Heartbeat de UUID divergente
não marca a máquina online. Login não transfere uma máquina que já pertence a outra pessoa e vincula somente o par ID/UUID.
Reinstalações com UUID diferente precisam de regularização do cadastro por administrador.

Inclui testes de regressão de cofre, favoritos, compartilhamento entre clientes, vínculo de dono, sysinfo, heartbeat,
comandos e dono das listas. O Dockerfile executa os testes antes de compilar a API. O patch foi aplicado e testado sobre
`v2.6.29`, após os patches 0001 a 0018, que é o caminho usado para construir a imagem de produção.

Limite: UUID continua sendo uma credencial implícita do protocolo legado. Autenticação criptográfica do dispositivo é uma
melhoria futura; estes ajustes não substituem uma revisão completa do protocolo RustDesk.
