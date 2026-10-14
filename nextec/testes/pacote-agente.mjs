// Apoio dos testes: o pacote do agente montado a partir dos scripts reais de nextec/atualizacao (a fonte oficial).
import { readFileSync } from 'node:fs'
import { buildAgentPackage, AGENT_PACKAGE_FILES } from '../../src/nextec/agent-package.mjs'

export const PASTA_ATUALIZACAO = new URL('../atualizacao/', import.meta.url)

export function lerScripts() {
  const files = {}
  for (const n of AGENT_PACKAGE_FILES) files[n] = readFileSync(new URL(n, PASTA_ATUALIZACAO), 'utf8')
  return files
}

let pacote = null
export async function pacoteReal() {
  if (!pacote) pacote = await buildAgentPackage(lerScripts())
  return pacote
}
