# Atualização dos clientes (Windows)

**Instalar em um cliente já com o cliente certo:** use o comando de Dispositivos > Clientes > Comando de instalação (acrescenta `-GrupoId` e `-ChaveCliente`).

**A partir da versão 2.3.0 do painel, o jeito principal é pelo próprio painel (Dispositivos > Atualizações do app): não precisa mais de bucket, `Publicar-Versao.ps1` nem `versao.json`.** O `Instalar-Nextec.ps1` usa o painel por padrão. O restante deste arquivo descreve o site no R2, que continua funcionando com `-UrlBase https://atualizar.nex.tec.br`.

Os clientes recebem atualização de um site nosso (`https://atualizar.nex.tec.br`, um bucket do Cloudflare R2),
sem depender do RustDesk oficial. O aviso de "nova versão" oficial é desligado na geração (removeNewVersionNotif).

## Como funciona
1. O rdgen gera o instalador. Usamos o **MSI** (instala em modo silencioso e atualiza por cima).
2. `Publicar-Versao.ps1` copia o MSI com o nome `nextec-acesso-<versão>.msi` e atualiza o `versao.json`
   (versão, nome do arquivo e SHA-256).
3. Enviamos os dois arquivos para o bucket.
4. O cliente roda `Instalar-Nextec.ps1`: baixa, confere o hash, instala e cria uma tarefa agendada diária
   ("Nextec Acesso - Atualizacao", como SYSTEM). A mesma tarefa repete a checagem e atualiza sozinha.

## Formato do versao.json
```json
{
  "windows": { "versao": "1.0.1", "arquivo": "nextec-acesso-1.0.1.msi", "sha256": "..." },
  "linux": null
}
```
A parte `linux` fica reservada (script próprio quando houver cliente em Linux).

## Cloudflare R2 (uma vez)
1. Cloudflare > R2 > **Criar bucket** `nextec-atualizacao` (localização automática).
2. No bucket > **Configurações** > **Domínios personalizados** > adicionar `atualizar.nex.tec.br`
   (a zona `nex.tec.br` já está na Cloudflare; o registro é criado sozinho, com HTTPS).
   Para trocar de hospedagem no futuro, basta mudar o DNS desse nome.
3. **Regra de cache** para `atualizar.nex.tec.br/versao.json`: ignorar o cache (Bypass cache), para a versão nova valer na hora.
4. Não ative a listagem pública do bucket. O endereço dos arquivos é aberto a quem o conhece, mas não é listado.
   Os arquivos não têm segredo: o MSI leva o endereço do servidor e a chave **pública**.

## Publicar uma versão
```powershell
.\Publicar-Versao.ps1 -Msi C:\Downloads\nextec.msi -Versao 1.0.1
```
Envie o conteúdo de `publicar\` (o MSI novo e o `versao.json`) para o bucket: painel do R2 > Enviar objetos.
Em até um dia (a tarefa tem atraso aleatório de até 2 horas), as máquinas atualizam sozinhas.
Para testar sem instalar nada: `.\Instalar-Nextec.ps1 -SoVerificar`.

## Instalar em um cliente novo
Como administrador: `.\Instalar-Nextec.ps1`. Para forçar a reinstalação: `-Forcar`.
Registro em `C:\ProgramData\Nextec\Acesso\atualizacao.log`.

## Segurança
- O hash é conferido antes de instalar; arquivo adulterado em trânsito ou corrompido é recusado.
- Quem tiver permissão de escrita no bucket decide o que as máquinas instalam. Guarde o acesso ao R2 com
  login pessoal e MFA, sem chave compartilhada.
- Teste cada versão em uma máquina e depois em um grupo pequeno antes de publicar para todos.

## Pontos a confirmar no primeiro teste
- Que o MSI gerado pelo rdgen atualiza por cima da versão anterior sem perder o ID da máquina.
- Que a tarefa agendada roda como SYSTEM e instala sem janela.
