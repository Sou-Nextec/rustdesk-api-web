# Teste ponta a ponta no Windows Sandbox

Prova, numa instalação limpa e descartável, o fluxo real do servidor: app Nextec instalado **sem** o agente novo + o
`Ativar-Nextec-<ID>.cmd` gerado pelo painel => agente instalado, cadastrado, senha trocada pelo app real e confirmada.

## Cenários (um sandbox novo por cenário)

| Cenário | O que prova |
| --- | --- |
| C1 | Caminho feliz: sem agente, roda o `.cmd`, tarefas SYSTEM, cadastro, `--password` real, confirmação, ciclo repetido |
| C2 | Cliente com `disable-settings`: "Settings are disabled!" vira `client_settings_locked`, para de repetir, `last_error` no painel |
| C3 | Agente antigo (11/10) + `.cmd`: recusa do painel desfaz tudo byte a byte; depois backup, substituição e cadastro |
| C4 | Nome livre (simulado: pasta, exe e serviço renomeados + marcador HKLM) repetindo o C1 |

## Como rodar (no host, Windows 10/11 Pro com o recurso Windows Sandbox, node e git)

```powershell
.\nextec\testes\sandbox\Invoke-SandboxTest.ps1 -MsiApp 'C:\caminho\Nextec-Connect.msi' -Saida 'C:\caminho\saida' -Cenarios C1,C2,C3,C4
```

Use um MSI **sem** o agente (ex.: 2.0.7). Com o MSI 2.0.9 o agente já vem instalado e o C1 deixa de testar o `.cmd`.
Um sandbox por vez; a máquina precisa de uns 2,5 GB de RAM livres. Cada cenário leva de 4 a 12 minutos.
Para habilitar o recurso (PowerShell administrador, uma vez): `Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All`.

## Segurança do teste

- `.wsb`: `Networking=Disable`, `vGPU`, áudio, vídeo, impressora e área de transferência desligados, `ProtectedClient`, 2 GB.
- Entrada (`C:\NxIn`) somente leitura; saída (`C:\NxOut`) é a única pasta gravável. Nenhuma pasta pessoal é mapeada.
- O painel é **falso** (`FakePanel.ps1`), em HTTPS de loopback com certificado autoassinado confiado só dentro do sandbox e
  entrada no `hosts` para o host de teste. Nenhuma chave, token ou senha real: tudo é gerado na hora.
- O app deriva o ID do MAC; sem rede o sandbox não tem MAC. O script cria o adaptador *Microsoft KM-TEST Loopback* (do
  próprio Windows) pelo SetupAPI: dá um MAC e nenhuma rota. O teste confere que não há rota padrão.
- Ao fim, varre a saída atrás da autorização, do token proposto e da senha (`painel-estado.json` guarda só o tamanho).

## O que sai em `saida\<cenário>\`

`verificacoes.md` na raiz da saída (`Resumir-Resultado.ps1` refaz a tabela), e por cenário `resultado.json` (verificações
com passou/falhou e detalhe), `execucao.log`, `painel-chamadas.log`, `evidencias-<cenário>\`
(logs do agente, listagem da pasta de dados, tarefas), `<cenário>-vivo-*.log` (logs copiados enquanto o `.cmd` roda,
porque o rollback apaga os logs novos), capturas de tela e `msi-install.log`.

## Limites conhecidos

- O `.cmd` é o **modelo** gerado pelo mesmo `buildActivationCmd` e pelo mesmo pacote do painel; dentro do sandbox só as
  linhas `rem NXID/NXEXP/NXDATA` são trocadas pelo ID e MachineGuid do sandbox (o ID só existe depois do app instalado).
- C2 grava `disable-settings=Y` no `custom_.txt` do app instalado (onde o gerador injeta a opção); não é um build gerado com ela.
- C4 é simulado (o MSI compilado não troca de nome). Não substitui gerar o app com outro nome.
- Não cobre atualização via painel real, assinatura real, UAC interativo nem o MSI com o agente embutido.
