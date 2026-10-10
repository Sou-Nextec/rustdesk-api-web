# Imagem Nextec: hbbs e hbbr são os da lejianwen. Trocamos o painel (/app/resources/admin),
# acrescentamos o pt-BR do backend e recompilamos a API com o patch de nextec/backend/
# (o mesmo enviado ao projeto original: https://github.com/lejianwen/rustdesk-api/pull/540).
# Quando o PR for aceito e publicado na imagem base, use NEXTEC_API_PATCH=0 ou remova o estágio "api".
#
# Build, a partir da raiz do repositório:
#   docker build -f nextec/docker/Dockerfile -t nextec/rustdesk-server-s6:1.0.0 .
#
# BASE_TAG: tag da imagem lejianwen/rustdesk-server-s6.
# API_TAG:  versão do código da API compatível com essa imagem (veja /app/resources/version nela).
# O build falha se as duas não baterem, para não misturar versões.

ARG BASE_TAG=v0.1.2
ARG API_TAG=v2.6.29
ARG NEXTEC_API_PATCH=1

FROM node:22-alpine AS panel
# versão mostrada na tela (o workflow passa master-<commit> ou a tag)
ARG NEXTEC_VERSION=dev
ENV VITE_NEXTEC_VERSION=${NEXTEC_VERSION}
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM golang:1.23-alpine AS api
ARG API_TAG
RUN apk add --no-cache git build-base
WORKDIR /src
RUN git clone --depth 1 --branch ${API_TAG} https://github.com/lejianwen/rustdesk-api.git .
COPY nextec/backend/*.patch /patches/
RUN git apply /patches/*.patch
# o repositório da API não versiona o go.sum; o workflow oficial também resolve as dependências no build
RUN go mod tidy
RUN CGO_ENABLED=1 go test ./service ./utils ./http/router ./http/controller/api ./http/controller/admin/my ./http/controller/web
RUN CGO_ENABLED=1 go build -ldflags "-s -w -linkmode external -extldflags -static" -o /out/apimain ./cmd/apimain.go

FROM lejianwen/rustdesk-server-s6:${BASE_TAG}
ARG NEXTEC_VERSION=dev
ARG API_TAG
ARG NEXTEC_API_PATCH
RUN test "$(cat /app/resources/version)" = "${API_TAG#v}" || \
    (echo "Versão da imagem base ($(cat /app/resources/version)) diferente de API_TAG (${API_TAG})" && exit 1)
COPY --from=api /out/apimain /tmp/apimain-nextec
RUN if [ "${NEXTEC_API_PATCH}" = "1" ]; then mv /tmp/apimain-nextec /app/apimain && chmod +x /app/apimain; else rm /tmp/apimain-nextec; fi
RUN rm -rf /app/resources/admin
COPY --from=panel /src/dist/ /app/resources/admin/
# A versioned URL prevents browsers/CDNs from retaining an old WebSocket hostname.
RUN sed -i "s|/webclient-config/index.js|/webclient-config/index.js?v=${NEXTEC_VERSION}|g" /app/resources/web/index.html /app/resources/web2/index.html
COPY nextec/i18n/pt_BR.toml /app/resources/i18n/pt_BR.toml
# mensagem de boas-vindas da tela "Meus dados" (o padrão do upstream é em chinês)
COPY nextec/conf/hello.html /app/conf/admin/hello.html
LABEL org.opencontainers.image.title="Nextec RustDesk Server" \
      org.opencontainers.image.description="lejianwen/rustdesk-server-s6 com painel Nextec, pt-BR e correção na API" \
      org.opencontainers.image.source="https://github.com/Sou-Nextec/rustdesk-api-web"
