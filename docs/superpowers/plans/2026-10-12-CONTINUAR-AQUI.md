# Continuidade - cliente Nextec Connect

Atualizado em 2026-10-12. Leia este arquivo primeiro, depois `2026-10-11-estabilizacao-cliente.md`, `2026-10-11-evidencias-cliente.md` e `../../../nextec/ROADMAP-CLIENTE.md`. Este registro complementa as evidências anteriores; não significa que o plano inteiro terminou.

## Repositórios e autorização

- API: Sou-Nextec/rustdesk-api-web, branch principal master; checkout de trabalho `cliente-estabilizacao`.
- Gerador: Sou-Nextec/rdgen, branch principal master; checkout de trabalho `rdgen-cliente-estabilizacao`.
- Diretório compartilhado: `C:\Users\Leonam Daris\Documents\Projetos Programacao\RustyDesk Admin`.
- Usuário autorizou correções, testes de regressão, PRs, merge somente com checks necessários verdes e rollout. SSH autorizado: `ssh app03 (alias; usuário leonam_daris com sudo, nunca root)`.
- Commits locais e remotos têm SHAs diferentes porque a publicação usou o conector GitHub. Não resetar checkouts nem sobrescrever alterações. Verificar refs atuais antes de trabalhar.
- Cada bug significativo corrigido deve ganhar teste de comportamento que reproduza a falha.
- Não colocar chave privada, senha, tokens, banco ou backups no Git. Não reativar credencial revogada nem restaurar permissões/grupos silenciosamente.

## Concluído e verificado

- API PRs 64 e 65 mesclados; RDGen PRs 34, 35 e 36 mesclados, todos com checks necessários verdes.
- RDGen master após PR36: `ac675c319465c42199793672c5821ce3fdd121c7`.
- PR35 corrige formulário inválido sem aviso: HTTP400 e mensagem acessível, sem repetir valores submetidos. Teste CSRF distingue HTTP403 de formulário inválido HTTP400.
- PR36 corrige assinatura do MSI: pedido semântico 2.0.9 aceita ProductVersion exata ou 2.0.9.0; rejeita revisão não zero e versões diferentes. Hash, tamanho e produto continuam obrigatórios.
- Verificação APP03 às 16:36 UTC: RDGen healthy, imagem `sha256:987c9c559dcaef08f28d4e0627e216910e813eacb0a52257acac3e3e7aa22281`; API healthy, imagem `sha256:5f88655db42bad362eabb3012f6679dbffa0366855c3a2579736847273d81067`. Chave pública RustDesk legível em `/chave/id_ed25519.pub` pelo usuário do container. Verificar novamente antes de declarar estado atual.
- Build real do cliente: https://github.com/Sou-Nextec/rdgen/actions/runs/38274420691, sucesso; 16:01:04–16:24:39 UTC, 23min35s. Cliente 2.0.9, base estável RustDesk1.5.0, tema escuro solicitado. Aparência final ainda precisa de homologação.
- Geração UUID `0aa5e542-98a2-4353-a4f9-e7bb479de2e0`; MSI e EXE disponíveis em Itens gerados. Versão importada em Atualizações, NÃO autorizada nem publicada para a frota.
- MSI ProductName Nextec-Connect; ProductVersion 2.0.9.0; contém Instalar-Nextec, Coordenar-Agente-Nextec, Provisionar-Agente-Nextec e Agente-Senha-Nextec. CustomActions registram atualizador e coordenador, removem tarefas na desinstalação verdadeira.
- EXE inspecionado sem executar: recursos Nextec.Client.msi e Nextec.Client.portable.exe. MSI incorporado tem exatamente o mesmo hash do MSI separado. Há escolha Executar sem instalar/Instalar; modo portátil não cria tarefas privilegiadas.
- SHA256 MSI: `33950f32bef0e445b5800a598a6da6fb4d1b649fe7cfb2907e63b48dfb34e220`.
- SHA256 EXE: `26126dbcf1bca0d6811c756072c243b449b90e3a3ce01d9c27d6ab30c146094a`.
- Pacotes locais e evidência JSON: pasta raiz `auditoria/cliente-2.0.9`. Assinador local preparado em `auditoria/cliente-2.0.9/assinador/Assinar-Connect.cmd`.
- Assinador: chave cifrada obrigatória, senha apenas em memória por sessão de15min, verificação de chave pública, hash/produto/versão e anti-replay. Testes finais:13 passaram no Linux; Windows13 executados com1 skip referente a DEB. CI também validou EXE, DEB e instalação/reparo/desinstalação MSI nas bases1.5.0/master.
- Primeiro cadastro de agente exige autorização individual temporária de15min, entregue por sessão confiável. Depois coordenador recupera falhas sem duplicar identidade nem reativar revogados. Não prometer cadastro privilegiado sem autorização inicial.

## Pendências e ordem de execução

1. Caminho da chave e script de assinatura: ver nextec/atualizacao/ASSINATURA.md (PR em andamento). Usuário digita a senha no assistente local; nunca no chat/painel.
2. Baixar pedido da versão2.0.9 em Atualizações → Autorizar → Baixar pedido de assinatura; usar pacote cujo hash confere. Assinar localmente, enviar manifesto e assinatura e validar autorização. O download automatizado no navegador expirou e a sessão de automação perdeu conexão; não há pedido local confirmado. Não inventar sequência nem montar manifesto manual para contornar contador.
3. Piloto no Windows Server2022 afetado: usuário tem AnyDesk/RustDesk; não há SSH/WinRM de teste informado. Verificar uma instalação real autorizada, ID único do serviço, cadastro, tarefas SYSTEM, heartbeat, senha aplicada/confirmada, conexão sem copiar senha e sessão mantida durante rotação. Testes do runner CI não substituem esse piloto.
4. Exercitar migração instalaçãoEXE → atualizaçãoMSI, reparo e upgrade preservando ID/configurações; comprovar com o pacote customizado real.
5. Confirmar visual no cliente final: tema escuro separado de nightly, logos claros/escuros, imagens de instalador, idioma; verificar gerador e Atualizações no tablet. Não declarar todas as demandas visuais concluídas.
6. Tratar página do painel aberta com assets antigos após rollout: houve falha de importação dinâmica, recarregar resolveu. Recuperação automática ainda não implementada.
7. Linux: console com login individual do SO NÃO concluída. RustDesk1.5.0 terminal usa SelfUser (conta do processo), não autentica usuário/senha Linux. Deep link upstream `{scheme}://terminal/{ID}?password=...` usa senha do peer RustDesk. Não oferecer shell root como se fosse login individual. Implementar mecanismo adequado e homologar; PAM completo é fase futura.
8. Só expandir atualização para a frota depois de assinatura real e piloto. Registrar versão, checks, digest ativo e resultado real separadamente.

## Endereços

- Gerador e Itens gerados: https://painel-remoto.nex.tec.br/_admin/#/user/generator
- Atualizações: https://painel-remoto.nex.tec.br/_admin/#/user/updates
- Assinador protegido pelo acesso do painel: https://painel-remoto.nex.tec.br/gerador/nextec/atualizacao/assinador.zip
- MSI: https://painel-remoto.nex.tec.br/gerador/download?uuid=0aa5e542-98a2-4353-a4f9-e7bb479de2e0&filename=Nextec-Connect.msi
- EXE: https://painel-remoto.nex.tec.br/gerador/download?uuid=0aa5e542-98a2-4353-a4f9-e7bb479de2e0&filename=Nextec-Connect.exe

## Como continuar com outra IA

Instrução: Leia este ponto de continuidade e os planos vinculados. Confira Git/PRs/containers atuais. Execute as pendências na ordem, sem repetir builds já bem-sucedidos sem causa. Corrija com testes de regressão, mantenha chave privada e senha locais, e só mescle com checks necessários verdes. Não trate CI, importação da release ou container healthy como prova de assinatura real/piloto completo.
