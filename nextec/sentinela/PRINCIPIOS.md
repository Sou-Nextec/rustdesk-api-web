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

## 5. Tudo configurável

Tudo que puder ser configurável nasce como configuração desde o início, nunca como valor fixo no código, mesmo que ainda
não apareça na tela. Mudar amanhã deve ser só trocar um valor.

- **Exemplos:** nome do produto, logo, cores e textos (tema), permissões e perfis, políticas de rotação, prazos de
  retenção, janelas de horário, limites de sessão, endereços e integrações.
- **Camadas com precedência:** padrão de fábrica, depois global, depois cliente, depois grupo e item. O mais específico vence.
- **Padrões documentados:** toda configuração tem valor padrão seguro e descrição do que faz.
- **Validação:** valor inválido é recusado com mensagem clara; nunca derruba o sistema.
- **Auditoria:** toda mudança de configuração registra quem, quando, valor antigo e novo.
- **Limites de segurança não se desligam:** a configuração ajusta dentro de um piso seguro (ex.: MFA sempre ligado,
  auditoria sempre ativa, retenção mínima legal). Um valor que enfraqueça a segurança abaixo do piso é recusado.
- **Identidade visual em tokens de tema:** cores, logo, fontes e nome ficam em variáveis de tema centralizadas (tokens de
  design, variáveis CSS). Nenhuma cor ou logo fixa espalhada no código; trocar num lugar só muda a plataforma inteira.
- **Automatizar o que puder:** tarefa repetitiva (testes, verificações, relatórios, rotações) nasce agendada e automática,
  com registro do resultado; manual só quando exigir decisão humana.
- **Segredo não é configuração:** senhas, tokens e chaves ficam no cofre ou em variável de ambiente, nunca no arquivo ou
  na tela de configuração.

## 6. Documentação obrigatória, em dois níveis

Nada fica pronto sem documentação. Não é documentar cada detalhe: é qualquer pessoa conseguir entender e usar.

**Nível 1, documentação técnica e histórica**
- Toda funcionalidade nova tem uma página explicando o que faz, como funciona e por quê, com desenho quando ajudar.
- `CHANGELOG.md` por versão, que alimenta a tela "Novidades" dentro da plataforma.
- Decisões em `ARQUITETURA.md`, evolução em `ROADMAP.md`, bugs em `CORRECOES.md`, oportunidades em `ACHADOS.md`.
- Viu algo que precisa de documentação e não dá para fazer na hora? Registra em `ACHADOS.md` para não se perder.

**Nível 2, ajuda dentro da plataforma**
- Cada tela tem botão de ajuda próprio daquela tela, nunca um texto genérico.
- A ajuda diz o que cada parte faz e o passo a passo para usar ("faça isso, depois isso"), em linguagem simples, para a
  pessoa trabalhar sozinha sem treinamento ou certificação.
- O painel atual já tem esse mecanismo (botão de ajuda por tela, chaves `NxHelp<Rota>`); o Sentinela segue o mesmo modelo.
- Os textos de ajuda também são configuráveis (princípio 5), não fixos no código.

**Regra de manutenção (definição de pronto)**
Uma mudança só está pronta quando vem com, no mesmo PR:
1. o código e os testes;
2. a documentação técnica atualizada;
3. o texto de ajuda da tela atualizado;
4. a linha no `CHANGELOG.md`.

A revisão do PR confere os quatro; faltando um, não entra.

## Histórico

| Data | Mudança |
| --- | --- |
| 17/10/2026 | Criação |
| 17/10/2026 | Princípio 5: tudo configurável |
| 17/10/2026 | Tokens de tema e automatizar o que puder |
| 17/10/2026 | Princípio 6: documentação obrigatória em dois níveis |
