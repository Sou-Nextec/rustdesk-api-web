// Versão do painel. O build da imagem passa "2.0.1+1a2b3c4" (nextec/VERSION + commit); fora dela vale "dev".
const RAW = import.meta.env.VITE_NEXTEC_VERSION || 'dev'
const [semver, build = ''] = RAW.split('+')

export const NEXTEC_SEMVER = semver
export const NEXTEC_BUILD = build
export const NEXTEC_VERSION_LABEL = /^\d/.test(semver) ? `v${semver}` : semver
// x.y.0 traz novidade visível: o painel abre as Novidades uma vez; correções (x.y.z) não interrompem ninguém
export const NEXTEC_IS_FEATURE_RELEASE = /^\d+\.\d+\.0$/.test(semver)
