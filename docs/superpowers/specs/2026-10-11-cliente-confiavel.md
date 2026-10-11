# Cliente Nextec confiável: escopo aprovado

Data: 2026-10-11. Estado: especificação; nenhuma implementação autorizada por este documento.

## Objetivo

Abrir ou instalar o cliente, aparecer no painel, receber a política correta, conectar com o mínimo de cliques e atualizar preservando a identidade. Produção depende de evidência do ciclo completo, não apenas de CI ou webhook verde.

## Decisões do usuário

- Prioridade: corrigir o cliente antes de ampliar funcionalidades.
- EXE permite abrir sem instalar; instalação EXE e MSI convergem para o mesmo produto.
- Máquina instalada recebe gerenciamento e atualização automaticamente, sem executar scripts manualmente depois.
- Permissão do analista é verificada em cada nova conexão; o painel entrega a senha vigente ao aplicativo sem copiar/colar.
- Política de servidores pode rotacionar a senha de acesso remoto a cada 15 minutos.
- Rotação não encerra sessão autenticada. Encerrar sessão é ação independente.
- Revogar acesso bloqueia novas conexões; ação explícita adicional encerra sessões existentes.
- Linux nesta etapa: terminal/console, com usuário e senha do sistema informados pelo analista. Não automatizar login do sistema, rotação de root ou SSH.
- PAM entra depois, com credenciais temporárias/rotacionadas do servidor e autorização individual. Preferência por PAM; IAM integra a identidade do analista.
- Documentação e testes de regressão acompanham cada correção significativa.
- Preferir dois agentes Luna com tarefas separadas, contexto mínimo e revisão concentrada nos riscos.

## Limites e segurança

- ID numérico não é prova de identidade; conferir executável, serviço, perfil e identidade persistida.
- Detectar uma máquina não concede acesso nem permite escolher arbitrariamente seu cliente/grupo.
- Cadastro automático preserva revogação, proprietário e vínculos. Não aceitar troca de UUID sem prova autorizada.
- Diferenciar remover da listagem, arquivar, revogar e desinstalar; não usar exclusão como procedimento normal de reparo.
- Não gravar senhas de conexão em logs, histórico de auditoria, telemetria ou catálogo.
- Senha RustDesk é distinta da senha de usuário Linux/SSH e do login do painel.
- Não prometer terminal em uma versão-base sem testar a capacidade real. GUI headless não é equivalente a terminal.
- Não construir PAM próprio nesta fase.
- Preservar manifesto assinado, hash, tamanho, validade e proteção contra repetição. Assinatura do manifesto e Authenticode são mecanismos distintos.
- Chaves privadas, tokens de cadastro e backups ficam fora do Git e dos pacotes públicos.
- Publicações futuras usam piloto, verificação e merge somente com checks necessários verdes.

## Contratos de comportamento

1. Identidade: instalação/reparo/upgrade preservam o ID remoto e a identidade de gerenciamento. Havendo instalações concorrentes, parar com diagnóstico; nunca escolher outra silenciosamente.
2. Cadastro: cadastro ausente recebe recuperação explícita compatível com o protocolo; ausência de API não deve ser confundida com falha do relay. Usar repetição idempotente com espera progressiva, sem criar duplicatas.
3. Saúde: distinguir transporte, inventário, agente de senha, atualizador e política; cada estado inclui versão, última comunicação e erro sanitizado.
4. Senha: preparar operação, aplicar ao serviço correto e confirmar a mesma operação. Repetição/confirmação atrasada não substitui uma senha mais nova.
5. Conexão: todas as entradas do painel usam a mesma autorização/preparação. Uma corrida com a rotação permite no máximo uma nova preparação após recusa de autenticação, sem repetir indefinidamente.
6. Atualização: confirmar versão instalada e identidade preservada após instalação; falha de download ou assinatura não executa pacote. Falha de agente não pode ficar escondida sob sucesso do MSI.
7. Linux: o analista seleciona Conectar e Terminal é o padrão para servidor compatível. Credenciais do sistema são inseridas em canal protegido, sem armazenamento no painel nesta etapa.

## Critérios de produção

- Instalação limpa e upgrade em Windows Server 2022 e nas versões Windows de estação suportadas.
- Portátil não cria serviço/tarefa privilegiada; instalação por EXE e MSI cria componentes esperados.
- Reinício e ausência de usuário logado não mudam identidade nem impedem serviço permanente.
- Máquina detectada aparece no inventário; cadastro ausente recupera sem liberar dispositivo revogado.
- Agente e cliente exibem o mesmo ID; senha automática conecta pela tela principal e pelas demais entradas.
- Rotação após autenticação mantém sessão; próxima conexão usa senha vigente; encerramento explícito funciona.
- Usuário sem permissão não recebe senha nem inicia sessão gerenciada.
- Atualização real preserva ID/configuração e reporta conclusão, inclusive na migração EXE/MSI.
- Linux homologado executa terminal real, aceita credenciais do sistema e respeita permissões; capacidade ausente é informada claramente.
- Rollout comprova digest/versão efetivos e funcionamento real; aceitação do webhook não basta.

## Bases da análise

API/painel remoto consultado: master bd2bb79672252f2bfce91568f4e38ebc38f4a4c3. RDGen: master 20887525f61ecc83c0b451f599d993ef76f4d046. Revalidar antes da execução; checkouts locais possuem alterações e diferenças entre si.

- [RustDesk Pro: controle de acesso](https://rustdesk.com/docs/en/self-host/rustdesk-server-pro/permissions/)
- [RustDesk: MSI](https://rustdesk.com/docs/en/client/windows/msi/)
- [TeamViewer: Easy Access](https://www.teamviewer.com/apac/global/support/knowledge-base/teamviewer-remote/deployment/mass-deployment-user-guide/grant-easy-access-to-your-devices-and-device-groups-10-10/)
- [AnyDesk: portátil e instalado](https://support.anydesk.com/docs/portable-vs-installed)
- [AnyDesk: atualização de clientes personalizados](https://support.anydesk.com/update-anydesk)
