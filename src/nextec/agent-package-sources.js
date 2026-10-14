// Fonte oficial do pacote do agente embutido no Ativar-Nextec-<ID>.cmd: os mesmos scripts de nextec/atualizacao que o
// rdgen ressincroniza, importados como texto no build (Vite ?raw). Só o navegador usa este arquivo; os testes de node
// leem os arquivos direto e chamam buildAgentPackage de agent-package.mjs.
import coordenar from '../../nextec/atualizacao/Coordenar-Agente-Nextec.ps1?raw'
import provisionar from '../../nextec/atualizacao/Provisionar-Agente-Nextec.ps1?raw'
import agenteSenha from '../../nextec/atualizacao/Agente-Senha-Nextec.ps1?raw'
import { buildAgentPackage } from './agent-package.mjs'

export const AGENT_PACKAGE_SOURCES = {
  'Coordenar-Agente-Nextec.ps1': coordenar,
  'Provisionar-Agente-Nextec.ps1': provisionar,
  'Agente-Senha-Nextec.ps1': agenteSenha,
}

let cached = null
export function getAgentPackage() {
  if (!cached) cached = buildAgentPackage(AGENT_PACKAGE_SOURCES).catch((e) => { cached = null; throw e })
  return cached
}
