# Pendências e ideias do painel (backlog)

Lista viva do que foi visto na revisão de telas e ainda não foi mexido. Cada item diz onde e por quê.
A revisão de 09/10/2026 (v2.8.0) cobriu as 27 telas do painel no celular (390 px) e as novas em 1440 e 1900 px.

## Interface

- **Paginação com agrupamento (Dispositivos).** "Agrupar por cliente" pagina a lista inteira e depois agrupa a página. Um cliente
  com muitas máquinas pode ser cortado entre duas páginas. Opção: agrupar primeiro e paginar por seção, ou subir o tamanho da página
  quando agrupado.
- **Cartões do celular mostram todas as colunas preenchidas.** Em listas com muitas colunas técnicas (Dispositivos nas listas:
  Hash, Versão, Etiquetas) o cartão fica comprido. Opção: definir por tela quais colunas têm prioridade no celular.
- **Caixa de seleção sem rótulo nos cartões.** Nos cartões de Dispositivos e Logins a caixa de marcar aparece no topo sem texto.
  Funciona, mas pode ganhar "Selecionar".
- **Cabeçalho em telas muito estreitas (até 360 px).** Busca, "+", ajuda e foto disputam espaço com o título. Hoje o título
  encurta com reticências; uma solução é mover a ajuda para o menu do usuário.
- **Tema escuro no celular.** O escuro foi validado em desktop; no celular só o claro foi percorrido tela a tela.
- **Tablet (768 a 1024 px).** Não foi percorrido tela a tela; vale uma passada, principalmente Dispositivos e Relatório.
- **Teclado e zoom a 200%.** Foco visível e ordem de tabulação foram feitos nas telas novas, mas não houve teste sistemático
  com leitor de tela nem zoom de 200% nas telas antigas do upstream.
- **Textos que vêm do upstream.** Algumas telas antigas (Comandos avançados em Ajustes do servidor, Regras de compartilhamento)
  ainda têm termos técnicos em inglês ou em tradução literal. Conferir em uma rodada de textos.

## Funcionalidade

- **Chamado na conexão pelo app.** O pedido de chamado só vale para o botão Conectar do painel. Conexões abertas direto pelo app
  RustDesk não passam por ele (limite do app).
- **Fila Aguardando atendimento e clientes novos.** A fila usa "dispositivo novo, sem cliente e sem dono, visto nos últimos 10
  minutos". Se um cliente reinstalar um app antigo, ele pode não aparecer como novo.
- **Relatório mensal em Excel (.xlsx).** Hoje exporta CSV e impressão/PDF. XLSX exigiria uma biblioteca no painel.
- **Atribuição por cliente em máquinas que já têm cliente.** Por segurança nunca move; se for necessário mover em lote, já existe
  "Mover para um cliente" em Dispositivos.

## Operação

- **Assinatura digital dos executáveis.** Resolve de vez o bloqueio por antivírus (ML:Generic.MaliciousExe no Acronis).
- **Integração do rdgen ao painel (nível 1).** Tela "Gerar cliente" com acompanhamento e publicação automática. Hoje é manual.
- **Conta do Docker Hub no GitHub.** Evita falha do build da imagem por limite de requisições (erro 429 e timeout).
- **Backup fora da VPS** de `data/` e `api/` (senhas, atualizações, app de suporte, configurações).
