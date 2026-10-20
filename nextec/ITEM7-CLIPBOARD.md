# Item 7: capturas de tela duplicadas na área de transferência do Windows

Status: investigação feita pelo lado do repositório. **Causa-raiz NÃO confirmada** e **nenhuma correção aplicada**: faltam testes numa máquina Windows real com o cliente instalado (não há fonte nem binário do cliente neste ambiente). Nada foi alterado no cliente Windows.

## O que foi verificado (fatos do repositório)

| Ponto | Resultado |
|---|---|
| `rdgen/rdgenerator/views.py:141,217,238` e `forms.py:87` | `enable-clipboard` é só um interruptor Y/N gravado em `default-settings` ou `override-settings` do cliente gerado. Não há código de captura ou de sincronização de clipboard no gerador. |
| `rdgen/.github/patches/*` | Nenhum patch muda o comportamento de clipboard. `hidecm.diff` só reexibe a opção "ocultar janela de conexão" e mexe em `_hideCm`; a variável `_clipboardOk` aparece apenas como contexto do diff (estado visual da janela de conexão). Os demais (`allowCustom`, `privacyScreen`, `removeNewVersionNotif`, `removeSetupServerTip`, `xoffline`, `flutter_..._enableFilter`) não tocam clipboard. |
| Política do painel | `Policies.vue` (chave `enable-clipboard`, "Área de transferência") e `0012-politicas-e-sessoes.patch` (lista branca `{"Y","N"}`) só repassam o mesmo interruptor. O painel não implementa sincronização. |
| Agente PowerShell e instalador | Sem nenhuma referência a clipboard em `rdgen/nextec` e `rdgen/.github/scripts` (busca por clipboard, Set-Clipboard e Get-Clipboard sem resultados). |

Conclusão parcial: o comportamento vem do cliente RustDesk compilado, não de código Nextec. O build personalizado difere do oficial só pelos patches acima e pela configuração embutida.

## Hipóteses (a confirmar, não são fatos)

1. O serviço do cliente (`rustdesk.exe --server`, que roda sem janela aberta) mantém um monitor de clipboard ligado ao `enable-clipboard`. Ao detectar uma imagem copiada (captura de tela), pode reescrever o conteúdo em vários formatos (PNG, DIB), e cada reescrita vira uma entrada nova no histórico do `Win + V`.
2. Laço de sincronização: o próprio monitor reage à escrita que ele fez. Costuma ser contido por comparação de conteúdo; se a comparação falha para imagens, repete.
3. Regressão específica da versão do cliente usada no build (comparar com o RustDesk oficial da mesma versão).

O Teste 2 do relato (app fechado, sem duplicar) é coerente com 1 e 2, mas "app fechado" precisa ser conferido: fechar a janela não necessariamente encerra o serviço. Só o serviço parado (ou desinstalado) vale como controle.

## Protocolo de teste (máquina Windows real)

Anotar a versão do cliente e se o build é o da Nextec ou o oficial. Para cada linha, fazer 1 captura (`Win + Shift + S`), abrir `Win + V` e contar as entradas novas; depois testar colar texto e imagem.

| # | Estado | Esperado | Resultado |
|---|---|---|---|
| 1 | Cliente Nextec, janela aberta, sem sessão | 1 entrada | |
| 2 | Cliente Nextec, janela fechada, serviço ativo | 1 entrada | |
| 3 | Cliente Nextec, serviço do RustDesk parado | 1 entrada | |
| 4 | Cliente Nextec, durante sessão remota (outro lado com clipboard ligado) | 1 entrada | |
| 5 | RustDesk oficial, mesma versão, linhas 1 a 4 | referência | |
| 6 | Cliente Nextec com `enable-clipboard = N` (política global ou novo build) | 1 entrada | |

Leitura: se só a linha 6 resolve e o oficial (5) não duplica, a causa está num patch ou na configuração do build; se o oficial também duplica, é bug do upstream (abrir issue e avaliar patch em `rdgen/.github/patches/`). Coletar o log do serviço do cliente durante a captura.

## Mitigação imediata sem mexer no cliente

Desligar `enable-clipboard` na política global (Segurança > Políticas do app) elimina a sincronização de clipboard entre máquinas, mas **prejudica copiar e colar durante o atendimento**. Só usar se a linha 6 do protocolo confirmar que resolve e o suporte aceitar perder a função.

## Critérios de aceite do Notion ainda abertos

- Corrigir a duplicação: depende do resultado do protocolo.
- Validar texto e imagem com app aberto, fechado e em sessão: depende do protocolo.
- Documentar causa-raiz e evidências: este arquivo é o ponto de partida; preencher a tabela.
