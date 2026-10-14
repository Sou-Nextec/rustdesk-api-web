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
| `atualizador-agendamento.ps1` | local | Regressão do atualizador: tarefa criada antes da consulta ao manifesto e documentação da tela coerente |
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

## Testes do painel (front-end, sem contêiner)

Rodam no CI (workflow "Regressoes do cliente Nextec", antes do `npm run build`) e localmente depois de `npm ci`:

| Comando | Arquivo | O que garante |
| --- | --- | --- |
| `npm test` (`node --test nextec/testes/*.test.mjs`) | `templates-declarados.test.mjs` | Verificação estática: nenhum `.vue` com `<script setup>` de `src/nextec` e `src/layout` usa no template um nome que o script não declara (era a tela em branco de Senhas dos servidores) |
| `npm test` | `rodape-versao.test.mjs` | Rodapé com a versão é elemento próprio, fora da área rolável do menu, e mostra `master-<sha>` quando o build informa |
| `npm run test:nav` (`vitest`, jsdom) | `navegacao.spec.mjs` | Monta o App com o router real, o layout e as telas Nextec e percorre as rotas em sequência A, B, A, C (inclui ida e volta de Senhas dos servidores). Falha com erro no console, `app.config.errorHandler`, `unhandledrejection`, aviso do Vue sobre raiz sem elemento em `<transition>`, tela vazia ou `RenderGuard` preso |

A API é simulada em `navegacao.spec.mjs` (`vi.mock('@/utils/request')`); nenhum servidor é necessário.

Regras que esses testes protegem: toda tela de rota tem **um único elemento na raiz** (o `<transition mode="out-in">` do
layout não conclui a saída de raiz sem elemento e a tela seguinte nunca entra) e todo nome usado no template existe no script.
Dependências de teste ficam só em `devDependencies` (`vitest`, `jsdom`).

## Trava de integridade e testes de node (CI)

`node nextec/testes/verificar-integridade.mjs` roda no CI (workflow "Regressoes do cliente Nextec", em todo PR, logo depois do
`npm ci` e antes dos testes e do build). Sem dependências. Falha listando os arquivos se:

- patch, `.sh`, Dockerfile ou workflow estiver com CRLF no repositório (o `git apply` do Linux rejeita);
- `.ps1` com caractere não ASCII não começar com BOM UTF-8 (o Windows PowerShell 5.1 quebra o parse);
- a série `nextec/backend/*.patch` tiver nome fora de `NNNN-*.patch`, número repetido ou não for patch git. O `git apply` real
  de toda a série roda no build da imagem (`nextec-imagem.yml`, que também executa em PR), então não é duplicado aqui;
- `@vue/compiler-sfc` não estiver instalado (faltou `npm ci`): `templates-declarados`, `secrets-view` e `rodape-versao`
  dependem dele e agora ele é `devDependency` declarada, não só transitiva.

`.gitattributes` força LF em `.patch`, `.sh`, `.yml`, Dockerfile, `.mjs`, `.js`, `.vue` e `.json`. Os `.ps1` não são normalizados
(o git já preserva o BOM). `npm test` e `npm run test:nav` falham o PR; rode `node nextec/testes/verificar-integridade.mjs` antes de abrir um.
