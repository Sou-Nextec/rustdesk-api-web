// Build do painel: calcula o SHA-256 dos scripts do agente DIRETO DO DISCO (nextec/atualizacao) e o entrega ao código do
// navegador como __NX_AGENT_TREE_SHAS__. O pacote embutido no Ativar-Nextec-<ID>.cmd só é gerado se bater com estes
// hashes (agent-package-sources.js), então um arquivo velho em cache nunca vira o agente instalado.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { AGENT_PACKAGE_FILES } from './src/nextec/agent-package.mjs'

export function agentPackageTreeShas(root = process.cwd()) {
  const shas = {}
  for (const name of AGENT_PACKAGE_FILES) {
    shas[name] = createHash('sha256').update(readFileSync(join(root, 'nextec', 'atualizacao', name))).digest('hex')
  }
  return shas
}

export function agentPackagePlugin(root = process.cwd()) {
  return {
    name: 'nextec-agent-package-tree-shas',
    config() {
      return { define: { __NX_AGENT_TREE_SHAS__: JSON.stringify(agentPackageTreeShas(root)) } }
    },
  }
}
