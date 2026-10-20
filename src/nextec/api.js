// Endpoints que só existem na API com os patches da Nextec (nextec/backend/*.patch)
import request from '@/utils/request'

// liga ou desliga o cliente web na hora; responde 404 em servidores sem o patch 0002
export function setWebClient (data) {
  return request({
    url: '/nextec/web-client',
    method: 'post',
    data,
  })
}

// patch 0003: listas compartilhadas com o usuário logado e situação online do que ele enxerga
export function sharedCollections () {
  return request({ url: '/my/shared/collections' })
}

export function sharedAddressBooks (params) {
  return request({ url: '/my/shared/address_book/list', params })
}

export function sharedStatus (data) {
  return request({ url: '/my/shared/status', method: 'post', data })
}

// patch 0004: foto de perfil do próprio usuário (data URL png/jpeg/webp de até 150 KB; vazio remove)
export function setAvatar (avatar) {
  return request({ url: '/my/profile/avatar', method: 'post', data: { avatar } })
}

// patch 0007: modelos de cliente (subgrupos e permissões) guardados no servidor, só admin
export function getClientTemplates () {
  return request({ url: '/nextec/client-templates' })
}

export function saveClientTemplates (templates) {
  return request({ url: '/nextec/client-templates', method: 'post', data: { templates } })
}

// patch 0008: cofre de senhas dos servidores (somente admin) e link de conexão
export const secretsOverview = () => request({ url: '/nextec/secrets' })
export const secretsPolicy = (data) => request({ url: '/nextec/secrets/policy', method: 'post', data })
export const secretsRotate = (id) => request({ url: '/nextec/secrets/rotate', method: 'post', data: { id } })
export const secretsReveal = (id) => request({ url: '/nextec/secrets/reveal', method: 'post', data: { id } })
export const secretsUnenroll = (id) => request({ url: '/nextec/secrets/unenroll', method: 'post', data: { id } })
export const secretsAgentKey = () => request({ url: '/nextec/secrets/agent-key', method: 'post', data: {} })
export const secretsBootstrap = (id) => request({ url: '/nextec/secrets/bootstrap', method: 'post', data: { id } })
export const secretsAudit = () => request({ url: '/nextec/secrets/audit' })

// patch 0009: atualização do app pelo painel (somente admin)
export const updatesOverview = () => request({ url: '/nextec/updates' })
export const updatesSignature = (data) => request({ url: '/nextec/updates/signature', method: 'post', data })
export const updatesSignRequest = (version) => request({ url: '/nextec/updates/sign-request', method: 'post', data: { version } })
export const updatesRollout = (data) => request({ url: '/nextec/updates/rollout', method: 'post', data })
export const updatesDelete = (id) => request({ url: '/nextec/updates/delete', method: 'post', data: { id } })
export const importGeneratedRelease = (uuid) => request({ url: '/nextec/updates/import', method: 'post', data: { uuid }, timeout: 300000 })
export const updatesProfile = (version, profile) => request({ url: '/nextec/updates/profile', method: 'post', data: { version, profile } })
export const updatesInternal = (id, enabled) => request({ url: '/nextec/updates/internal', method: 'post', data: { id, enabled } })
export const availableApp = () => request({ url: '/my/app-version' })
// o envio do instalador usa XMLHttpRequest direto (progresso), em src/nextec/views/Updates.vue

// patch 0010: suporte avulso (página pública /suporte, app de suporte e lista aguardando atendimento)
export const supportInfo = () => request({ url: '/nextec/support' })
export const supportDelete = () => request({ url: '/nextec/support/delete', method: 'post', data: {} })
export const supportLinks = () => request({ url: '/my/support/links' })
export const supportLinkCreate = (data) => request({ url: '/my/support/links', method: 'post', data })
export const supportLinkRevoke = (id) => request({ url: '/my/support/links/revoke', method: 'post', data: { id } })
export const invitesList = () => request({ url: '/nextec/invites' })
export const inviteCreate = (data) => request({ url: '/nextec/invites', method: 'post', data })
export const inviteBatch = (data) => request({ url: '/nextec/invites/batch', method: 'post', data })
export const inviteRevoke = (id) => request({ url: '/nextec/invites/revoke', method: 'post', data: { id } })
export const supportWaiting = () => request({ url: '/my/support/waiting' })

// patches 0011 a 0013: instalação por cliente, políticas do app, conexões ativas, chamado e relatório
export const installToken = (group_id) => request({ url: '/nextec/install-token', params: { group_id } })
// patch 0047: listas "Cliente: X" sempre iguais ao cliente (inclui subgrupos, remove o que saiu)
export const clientListsSync = (collection_ids) => request({ url: '/nextec/client-lists/sync', method: 'post', data: { collection_ids } })
export const installRevoke = () => request({ url: '/nextec/install-token/revoke', method: 'post', data: {} })
export const policiesList = () => request({ url: '/nextec/policies' })
export const policySave = (data) => request({ url: '/nextec/policies', method: 'post', data })
// patch 0049: herança global > cliente > subgrupo > dispositivo
export const policyScopes = () => request({ url: '/nextec/policies/scopes' })
export const policyEffective = (peer_id) => request({ url: '/nextec/policies/effective', params: { peer_id } })
// item 5: lista paginada no servidor, árvore e troca em lote; itens 1 e 9: acesso por equipe e pessoa
export const devicesList = (params) => request({ url: '/nextec/devices', params })
export const devicesTree = () => request({ url: '/nextec/devices/tree' })
export const devicesMove = (data) => request({ url: '/nextec/devices/move', method: 'post', data })
export const accessGrant = (data) => request({ url: '/nextec/access/grant', method: 'post', data })
export const accessUsers = () => request({ url: '/nextec/access/users' })
export const accessUser = (user_id) => request({ url: '/nextec/access/user', params: { user_id } })
export const accessTeam = (team_id) => request({ url: '/nextec/access/team', params: { team_id } })
export const sessionsList = () => request({ url: '/nextec/sessions' })
export const sessionDisconnect = (peer_id, conn_id) => request({ url: '/nextec/sessions/disconnect', method: 'post', data: { peer_id, conn_id } })
export const ticketSettings = () => request({ url: '/nextec/ticket-settings' })
export const ticketSettingsSave = (data) => request({ url: '/nextec/ticket-settings', method: 'post', data })
export const reportMonth = (month, group_id) => request({ url: '/nextec/report', params: { month, group_id: group_id || undefined } })
export const connectSettings = () => request({ url: '/my/connect-settings' })
export const connectScheme = () => request({ url: '/nextec/connect-scheme' })
export const connectSchemeSave = (scheme) => request({ url: '/nextec/connect-scheme', method: 'post', data: { scheme } })
export const connectNote = (id, ticket, note) => request({ url: '/my/connect-note', method: 'post', data: { id, ticket, note } })
export const supportSettings = (waiting_mode) => request({ url: '/nextec/support/settings', method: 'post', data: { waiting_mode } })
export const supportPublicUrl = () => request({ url: '/my/support/public-url' })
export const supportPublicUrlSave = (public_url) => request({ url: '/nextec/support/public-url', method: 'post', data: { public_url } })

// patch 0031: inscrição global (a máquina se inscreve sozinha como pendente; o admin atribui a um cliente)
export const secretsAssign = (data) => request({ url: '/nextec/secrets/assign', method: 'post', data })
// uuid: a identidade que o admin viu na lista; se a linha mudou de identidade, a API recusa (conflito de identidade).
export const secretsReject = (id, block, uuid, reason) => request({ url: '/nextec/secrets/reject', method: 'post', data: { id, block: !!block, uuid: uuid || undefined, reason: reason || undefined } })
export const secretsUnblock = (id, uuid) => request({ url: '/nextec/secrets/unblock', method: 'post', data: { id, uuid: uuid || undefined } })
export const enrollKeyGet = () => request({ url: '/nextec/enroll-key' })
export const enrollKeyRotate = () => request({ url: '/nextec/enroll-key/rotate', method: 'post', data: {} })
