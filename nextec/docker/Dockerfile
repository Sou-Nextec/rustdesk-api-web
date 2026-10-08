# Imagem Nextec: o motor (hbbs, hbbr, API) continua sendo o da lejianwen.
# Só trocamos o painel (/app/resources/admin) e acrescentamos o pt-BR do backend.
#
# Build, a partir da raiz do repositório:
#   docker build -f nextec/docker/Dockerfile -t nextec/rustdesk-server-s6:1.0.0 .
# Para fixar a versão do motor: --build-arg BASE_TAG=<tag>

ARG BASE_TAG=latest

FROM node:22-alpine AS panel
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM lejianwen/rustdesk-server-s6:${BASE_TAG}
RUN rm -rf /app/resources/admin
COPY --from=panel /src/dist/ /app/resources/admin/
COPY nextec/i18n/pt_BR.toml /app/resources/i18n/pt_BR.toml
# mensagem de boas-vindas da tela "Meus dados" (o padrão do upstream é em chinês)
COPY nextec/conf/hello.html /app/conf/admin/hello.html
LABEL org.opencontainers.image.title="Nextec RustDesk Server" \
      org.opencontainers.image.description="lejianwen/rustdesk-server-s6 com painel Nextec e pt-BR" \
      org.opencontainers.image.source="https://github.com/Sou-Nextec/rustdesk-api-web"
