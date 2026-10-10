# Testes de regressão (PowerShell)

Scripts que exercitam as rotas do backend contra um **contêiner local** da imagem Nextec. Cada `Ok '...'` é uma verificação; no
fim aparece "Passaram: N de M". Foram usados antes de cada release do painel.

## Como rodar

1. Suba a imagem local (a que acabou de ser construída) com um banco novo, publicando uma porta de teste:

   ```bash
   docker build -f nextec/docker/Dockerfile -t rustdesk-nextec:dev .
   docker run -d --name nx-teste -p 21144:21114 -e RELAY=teste.local:21117 rustdesk-nextec:dev
   docker logs nx-teste | grep -i -A2 admin     # mostra a senha inicial do usuário admin
   ```

2. Defina a senha do admin do contêiner de teste e rode (PowerShell 5.1 ou 7):

   ```powershell
   $env:NX_TESTE_SENHA = '<senha do admin do contêiner de teste>'
   .\nextec\testes\cofre.ps1
   ```

   Os scripts `controle.ps1`, `updates.ps1` e `updates-fresh.ps1` também aceitam a senha como primeiro argumento.

3. Remova o contêiner ao terminar: `docker rm -f nx-teste`.

Use **sempre** um contêiner descartável. Os testes criam usuários, grupos e dispositivos e alguns trocam senhas.
Nunca aponte para o painel de produção.

## O que cada script cobre

| Script | Porta | Área |
| --- | --- | --- |
| `cofre.ps1` | 21114 | Cofre de senhas: chave de cadastro, máquina gerenciada, regras de senha, link com senha automática, permissões por papel |
| `agente.ps1` | 21114 | Agente de senha do Windows (`Agente-Senha-Nextec.ps1`): instala, cadastra, guarda o token protegido e troca a senha |
| `controle.ps1` | 21114 | Instalação por cliente (chave e atribuição), políticas por cliente e máquina, sessões e desconexão remota, chamados e relatório |
| `fila.ps1` | 21114 | Fila "Aguardando atendimento" e visibilidade |
| `updates.ps1` | 21114 | Atualização do app: lançamentos, piloto, instalações |
| `updates-fresh.ps1` | 21144 | O mesmo, partindo de um banco novo |
| `suporte.ps1` | 21144 | Suporte avulso: link, app de suporte, visibilidade |
| `ids.ps1` | 21144 | ID sem espaços ao criar, editar, sysinfo e heartbeat |

A porta é a que o script usa por padrão (`localhost:<porta>`); ajuste a variável `$base` no início do arquivo se subir o
contêiner em outra. Alguns scripts esperam um banco recém-criado; se um teste de "duplicado" falhar, suba um contêiner novo.

## Regras ao editar

Salve em UTF-8 com BOM e valide no PowerShell 5.1 (`[System.Management.Automation.Language.Parser]::ParseFile`), senão
acentos quebram a leitura. Em `Generic.List`, use `.ToArray()` em vez de `@($lista)`.
