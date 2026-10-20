# Laboratório local da Fase 0 (nunca produção)

Valida o patch 0045 contra uma imagem local: `parent_id` e caminho dos grupos, rejeição com carência (4 ciclos do agente) e
Senhas do servidor igual à listagem de Dispositivos.

```bash
docker build -f nextec/docker/Dockerfile -t nextec/rustdesk-server-s6:fase0 .
cd nextec/testes/lab-fase0 && mkdir -p api data && docker compose up -d
docker logs rdlab-fase0 | grep "Admin Password"      # senha do admin criada no primeiro start
python -I cenario.py <senha>                         # painel em http://127.0.0.1:18114
docker compose down                                  # e apague api/ e data/
```

## Bug 8 (patch 0046)

```bash
python -I cenario-bug8.py <senha> api/rustdeskapi.db   # chave por subgrupo, pendência com prazo, convite com conflito
```

O segundo argumento é opcional: com ele o cenário para o contêiner, vence a pendência de uma máquina no SQLite e reinicia. A
versão do convite é publicada gravando o rollout direto em `api/nextec-settings.json`, porque a publicação real exige manifesto
assinado pela Nextec. Resultado da última execução: 22 de 22. Bug 4: 15 de 15.

## Bug 4 (patch 0047)

```bash
python -I cenario-bug4.py <senha>   # listas "Cliente: X" ao salvar/mover, troca de subgrupo, cliente novo, sem cliente, reconciliação
```

## Item 6 (patch 0048)

```bash
python -I cenario-item6.py <senha> api/rustdeskapi.db   # nome fixo do MSI, sugestão por download, ambiguidade, convite recusado
```

## Itens 2, 3 e 11a (patch 0049)

```bash
python -I cenario-item23.py <senha>   # global > cliente > subgrupo > máquina, origem, aprovação automática, isolamento e auditoria
```
