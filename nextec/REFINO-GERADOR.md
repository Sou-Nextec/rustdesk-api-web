# Refinamento do gerador, 11/10/2026

## Objetivo e escopo

Risco médio, mudança reversível de apresentação e envio de formulários. O gerador usa cores, superfícies, campos e radius do painel, incluindo o tema grafite. A tela Gerar cliente incorpora `/gerador/` no mesmo domínio. Há alternativa para abrir outra aba quando a sessão do Cloudflare precisa de autenticação.

A aba Identidade visual e as imagens específicas de uma geração usam porcentagem medida por `XMLHttpRequest.upload`. Após enviar, a tela informa validação/preparação. Essa porcentagem não representa compilação. Falhas de rede mantêm os campos e arquivos selecionados, reabilitam os botões e pedem verificar o estado da operação antes de repetir. O envio bloqueia duplo clique e tem limite de espera de 120 segundos.

## Arquivos desta mudança

- Painel: `src/nextec/views/Generator.vue`.
- Gerador: `rdgenerator/templates/nextec_ui.html`, `nextec_upload.html`, `generator.html`, `branding.html`, `waiting.html`, `generated.html`, `failure.html`, `access_denied.html`, `config_problem.html`.
- Configuração: `rdgen/settings.py`, somente adição de `X_FRAME_OPTIONS = 'SAMEORIGIN'`.
- Testes: `rdgenerator/test_ui.py`.
- Decisões maiores: `rdgen/nextec/ROADMAP.md`.

## Segurança e operação

O painel não transmite tokens ou dados da sessão ao iframe. Mensagens de tema/altura verificam origem e janela de origem. A geração e o upload mantêm os endpoints, CSRF e autorização existentes. O Django permite incorporação somente por páginas da mesma origem; origens externas permanecem bloqueadas.

Esta mudança não cria migrações, variáveis, volumes ou rotas públicas. Para implantar, publicar ambas as imagens: o gerador precisa fornecer o protocolo de mensagens e permitir SAMEORIGIN antes de o painel incorporar a tela. Reverter os arquivos e as duas imagens restaura a abertura em outra aba.

## Validação e limitações

O build de produção do painel passou. A suíte Django com testes existentes e de UI passou: 45 testes. A prévia utiliza o componente Vue real, API de protocolo simulada e Django real em localhost, com armazenamento descartável. A geração é substituída por um resultado local, sem executar builds no GitHub.

Screenshots e relatório ficam em `auditoria/refino-gerador-2026-10-11/` a partir da raiz RustyDesk Admin. (Histórico de 2026-10-11) A autenticação do Cloudflare, suas políticas de frame e o deploy precisavam de smoke test no ambiente publicado; confirmar o estado atual antes de tratá-lo como pendente. Outras alterações locais preexistentes nos dois repositórios devem ser integradas em sua própria entrega; este refinamento não certifica essas alterações.

Foram verificadas 16 situações em Chrome headless: desktop 1440×900, tablet 768×1024, mobile 390×844 e largura equivalente a zoom de 200% (720×450), temas claro/grafite, ausência de overflow, envio de PNG ao Django real, sucesso, falha de rede, erro de formulário preservando Linux, retorno à geração após erro e altura estável da espera incorporada. Não houve erro JavaScript. A largura equivalente não substitui um teste de zoom real em produção. APIs do protocolo do app e despacho de build foram simulados, os demais formulários de upload e validações são reais.

Auditoria visual: removidos o cabeçalho azul, campos com caixas incompatíveis, dependência de ícones clicáveis para plataforma e aparência diferente entre gerador e identidade visual. Corrigidas a barra que aparecia após falha, a colisão do botão `action` com a URL do formulário e a repetição de declarações JavaScript após erro de validação. As screenshots desktop e mobile foram revisadas. O formulário continua extenso; transformá-lo em etapas fica para decisão posterior.

Estado de publicação (histórico de 2026-10-11; a master avançou desde então, atualmente v2.10.1, PRs até #65, e o texto abaixo descreve apenas o momento da auditoria): código implementado e validado localmente. Não publicado nesta tarefa, pois a tela de identidade visual e alterações de geração já estavam em edição antes desta mudança e ainda não estão consolidadas no histórico remoto. Publicar apenas parte deixaria o painel e o gerador incompatíveis. Na época, a consolidação e o smoke test do Cloudflare eram pendências de release, não de layout local.

Validação manual: abrir Dispositivos > Gerar cliente; alternar tema; visitar Identidade visual; selecionar PNG e salvar; conferir percentual, confirmação e prévia; simular falha de rede; conferir manutenção dos campos e botões habilitados. Usuário sem autorização continua recebendo bloqueio do gerador.
