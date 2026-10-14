# Releases assinadas do Nextec Connect

Usa a mesma chave RSA 4096 do monitoramento Nextec (ID público `8cb5b1d7f80d20cb`), com RSA PKCS#1 v1.5 e SHA-256. Só a chave pública está neste repositório. O manifesto exige `produto=nextec-connect`; um manifesto do monitoramento não autoriza a instalação do Connect.

No computador em que você já assina o monitoramento:

```powershell
python nextec/atualizacao/publicar-connect.py --msi "C:\Downloads\Client-Nextec-Connect.msi" --versao 2.0.3 --sequencia 1 --chave "D:\Chaves Nextec\nextec-atualizador-privada.pem" --saida "C:\Releases\Connect-2.0.3"
```

O caminho da chave é um exemplo: use a chave cifrada que já utiliza no monitoramento. OpenSSL pede a senha diretamente; ela não passa por argumentos, ambiente ou logs. O publicador confere se a assinatura corresponde à chave pública confiável antes de salvar os arquivos. Nunca envie a chave privada para o gerador, painel, CI ou clientes.

Cada autorização do Connect usa uma sequência maior que a anterior, independente da sequência do monitoramento. O número da versão é o da release do cliente; não precisa coincidir com a versão do gerador. O manifesto vence em 30 dias. Para renovar, gere outro manifesto para o mesmo MSI com sequência maior e atualize a autorização no painel.

Saída: `manifesto-connect.json` e `manifesto-connect.json.sig`. No painel, envie o MSI, escolha **Autorizar**, envie esses dois arquivos e publique primeiro para o grupo piloto. O painel confere produto, assinatura, versão, caminho, tamanho, hash e validade; o atualizador repete a conferência e recusa sequências antigas ou reutilizadas com conteúdo diferente.

O manifesto assinado autentica a release para o atualizador; não altera os avisos do Windows sobre executáveis sem Authenticode. A primeira instalação continua dependendo de um canal confiável.

Para cada máquina, rode `Instalar-Nextec.ps1` uma vez como administrador (comando em **Dispositivos > Atualizações do app > Instalar em uma máquina**). Ele cria a tarefa diária "Nextec Acesso - Atualizacao", como SYSTEM, antes de consultar o painel; assim a máquina continua verificando mesmo sem versão publicada. O script e o log ficam em `%ProgramData%\Nextec\Acesso`. O MSI do Nextec-Connect 2.0.9 já traz esse script e registra o atualizador e o coordenador do agente; as tarefas são removidas na desinstalação verdadeira. O script serve para máquinas com instalação anterior ou para reparar a tarefa.

Estado desta alteração: verificadores e publicador testados com chaves descartáveis e compatibilidade com a assinatura real do monitoramento. O atualizador já vai dentro do MSI 2.0.9 (instalação, reparo e desinstalação testados no runner Windows). Ainda pendem o teste de atualização em VM e a migração EXE→MSI preservando o ID. Os clientes já instalados em versões anteriores não passam a executar esse atualizador só porque o painel foi alterado.

## Estado do agente no painel (ativo, parado)

O agente consulta o painel (`/agent/sync`) a cada 5 minutos pela tarefa "Nextec Acesso - Coordenador". O painel só considera o agente **ativo** quando essa consulta chegou nos últimos 15 minutos (3 ciclos). O cadastro sozinho (`Ativar-Nextec-<ID>.cmd`, inscrição global) não prova que o agente roda: depois dele o estado é **parado** até a primeira consulta real (o texto diz "aguardando a primeira consulta" nos primeiros 15 minutos).

- **Se a ativação falhar depois do cadastro** (o `.cmd` desfaz scripts, tarefa e marcador): não há consulta, e o painel passa sozinho a **parado** em até 15 minutos ("Agente cadastrado, mas sem contato há N min. Reinstale o agente."). O `.cmd` não descadastra no painel (o token novo nunca foi guardado); `ativar.log` registra `painel_sem_consulta_ficara_parado`.
- **Reinstalar:** no painel, **Reinstalar agente** na linha da máquina (ou Senhas dos servidores > Mais > Autorização individual) baixa o mesmo `Ativar-Nextec-<ID>.cmd`. O servidor aceita a autorização para agente parado, troca o token e mantém as senhas guardadas; para agente ativo recusa (use Remover agente antes, se realmente quiser trocar).
- **Remover agente** apaga o cadastro e as senhas guardadas; a senha que está na máquina continua valendo até ser trocada ou o agente ser reinstalado.
