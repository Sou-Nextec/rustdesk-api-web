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
