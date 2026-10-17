# Projeto Sentinela: princípios de engenharia

Regras que valem para todo o desenvolvimento do Sentinela. Documento vivo, definido em 17/10/2026.

## 1. Segurança é a base

- Segurança vem antes de qualquer outra decisão: funcionalidade que enfraquece a segurança não entra.
- Menor privilégio, auditoria e corte imediato desde a primeira versão de cada recurso.
- Segredos nunca em código, log, URL, chat ou prompt de IA; sempre por variável de ambiente ou pelo cofre.
- Entrada sempre validada; autenticação e autorização em todo endpoint; erro tratado de forma explícita, nunca silenciosa.

## 2. Experiência de usuário

- Só o essencial na tela. O que não ajuda a tarefa do momento não aparece.
- Tudo fácil de encontrar: poucos cliques, busca, nomes claros.
- Toda ação tem retorno imediato e estados explícitos (carregando, erro, vazio, sucesso).
- Interface interna prioriza eficiência; interface do cliente prioriza clareza e zero ambiguidade.

## 3. Organização e documentação contínuas

Documentar enquanto programa, não depois.

| O que apareceu | Onde registrar |
| --- | --- |
| Bug encontrado | `CORRECOES.md`: o que acontece, como reproduzir, causa, correção e onde foi corrigido |
| Oportunidade de melhoria (não é bug) | `ACHADOS.md`: o achado, o ganho e a sugestão; depois de avaliado, vira etapa no `ROADMAP.md` |
| Decisão técnica | `ARQUITETURA.md`, seção de decisões |
| Mudança de comportamento para o usuário | `CHANGELOG.md` |

## 4. Programação assistida por IA

- A IA propõe; uma pessoa revisa e aprova. A IA não faz merge nem publica em produção.
- Mudanças pequenas e focadas, um assunto por PR, com descrição do que mudou e por quê.
- Teste junto com o código: cada correção vem com o teste que reproduz o bug; recurso novo vem com teste do fluxo crítico.
- CI verde e revisão (automática e humana) antes do merge; achado de segurança só fecha com decisão do dono.
- Contexto escrito no repositório (estes documentos), não só na conversa, para qualquer pessoa ou IA continuar.
- Nenhum dado real de cliente, senha ou token em prompt, teste ou exemplo.
- Código gerado é tratado como código de terceiros: ler antes de aceitar, conferir dependências novas e licenças.

## Histórico

| Data | Mudança |
| --- | --- |
| 17/10/2026 | Criação |
