# Backup do painel Nextec

O que precisa sobreviver a uma perda da VPS:

| Arquivo | Para quê | Se perder |
| --- | --- | --- |
| `data/nextec-vault.key` (ou a variável `NEXTEC_VAULT_KEY`) | Chave que cifra todas as senhas do cofre e assina as credenciais de inscrição | Senhas guardadas ilegíveis e todo instalador distribuído deixa de valer |
| `data/id_ed25519` e `.pub` | Chave do servidor de ID | Todos os clientes instalados deixam de reconhecer o servidor |
| `data/db_v2.sqlite3` | Máquinas, clientes, regras, auditoria | Tudo recomeça do zero |
| `data/nextec-settings.json` | Épocas das credenciais, protocolo do link | Credenciais voltam à época 1 |

## Gerar

```bash
# uma vez: senha do backup (guarde-a no cofre da Nextec; sem ela o backup não abre)
sudo sh -c 'umask 077; openssl rand -base64 33 > /root/.nextec-backup-pass'
# a cada execução (ou agende no cron, ver cabeçalho do script)
sudo BACKUP_PASSFILE=/root/.nextec-backup-pass /opt/rustdesk-nextec/backup-cofre.sh /mnt/backup-nextec
```

O script cifra com AES-256 (PBKDF2), grava `.sha256`, confere que o arquivo abre e mantém os 14 mais recentes. A senha vem de arquivo
com permissão 600, nunca da linha de comando. **Backup só na VPS não vale:** o destino precisa ser outro servidor ou nuvem
(monte o destino ou copie o arquivo gerado com `rclone`/`scp`).

## Restaurar (teste isto uma vez, em outro lugar, antes de precisar)

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in nextec-backup-AAAA-MM-DD-HHMM.tar.gz.enc -pass file:/root/.nextec-backup-pass | tar xz -C /tmp
ls /tmp/nextec-backup        # confira nextec-vault.key, id_ed25519, db_v2.sqlite3
```

Para voltar de verdade: pare a stack no Portainer, copie os arquivos para `${PASTA_DADOS}/data`, confira dono e permissões
(`id_ed25519` 0600), e suba a stack. Ao restaurar, o painel deve mostrar as mesmas máquinas e o cofre deve revelar as senhas.
