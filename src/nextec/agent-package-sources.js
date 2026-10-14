// Fonte oficial do pacote do agente embutido no Ativar-Nextec-<ID>.cmd: os mesmos scripts de nextec/atualizacao que o
// rdgen ressincroniza, importados como texto no build (Vite ?raw). Só o navegador usa este arquivo; os testes de node
// leem os arquivos direto e chamam buildAgentPackage de agent-package.mjs.
import coordenar from '../../nextec/atualizacao/Coordenar-Agente-Nextec.ps1?raw'
import provisionar from '../../nextec/atualizacao/Provisionar-Agente-Nextec.ps1?raw'
import agenteSenha from '../../nextec/atualizacao/Agente-Senha-Nextec.ps1?raw'
import { buildAgentPackage, verifyAgentPackage, sha256Hex, AGENT_PACKAGE_FILES } from './agent-package.mjs'

export const AGENT_PACKAGE_SOURCES = {
  'Coordenar-Agente-Nextec.ps1': coordenar,
  'Provisionar-Agente-Nextec.ps1': provisionar,
  'Agente-Senha-Nextec.ps1': agenteSenha,
}

// __NX_AGENT_TREE_SHAS__ vem do vite.config.js (vite-plugin-agent-package.mjs): SHA-256 dos arquivos da árvore LIDOS DO
// DISCO no momento do build. O pacote só sai se for igual ao que o painel importou e ao que está na árvore.
async function montar() {
  const pkg = await buildAgentPackage(AGENT_PACKAGE_SOURCES)
  await verifyAgentPackage(pkg, AGENT_PACKAGE_SOURCES)
  // eslint-disable-next-line no-undef
  const tree = typeof __NX_AGENT_TREE_SHAS__ !== 'undefined' ? __NX_AGENT_TREE_SHAS__ : null
  if (tree) {
    for (const name of AGENT_PACKAGE_FILES) {
      if (tree[name] !== pkg.shas[name]) throw new Error(`Pacote do agente diverge do arquivo da árvore no build: ${name}.`)
    }
  }
  return pkg
}

let cached = null
export function getAgentPackage() {
  if (!cached) cached = montar().catch((e) => { cached = null; throw e })
  return cached
}
