// Gera a pasta de ENTRADA do teste no Windows Sandbox (mapeada somente leitura): o Ativar-Nextec-<ID>.cmd MODELO
// (gerado pelo mesmo buildActivationCmd e pelo mesmo pacote de scripts que o painel usa) e os scripts oficiais.
// O modelo traz ID, uuid e autorizacao de MENTIRA: o Run-InSandbox.ps1 troca so as linhas `rem NXID/NXEXP/NXDATA`
// pelo ID e pelo MachineGuid do proprio sandbox (o ID do app so existe depois que ele e instalado).
// Uso: node gerar-entrada.mjs <pasta-de-saida>
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildActivationCmd } from '../../../src/nextec/activation-cmd.mjs'
import { AGENT_PACKAGE_FILES } from '../../../src/nextec/agent-package.mjs'
import { pacoteReal, PASTA_ATUALIZACAO } from '../pacote-agente.mjs'

const saida = process.argv[2]
if (!saida) { console.error('uso: node gerar-entrada.mjs <pasta-de-saida>'); process.exit(2) }
mkdirSync(join(saida, 'scripts'), { recursive: true })

const pkg = await pacoteReal()
const modelo = buildActivationCmd(
  { painel: 'https://painel-modelo.nextec.test', id: '100000001', uuid: 'TU9ERUxP', bootstrap: 'M'.repeat(43) },
  Date.now(), pkg,
)
writeFileSync(join(saida, 'Ativar-Modelo.cmd'), modelo, 'latin1')

const manifesto = { scripts: {}, pacote_shas: pkg.shas }
for (const nome of AGENT_PACKAGE_FILES) {
  const bytes = readFileSync(new URL(nome, PASTA_ATUALIZACAO))
  writeFileSync(join(saida, 'scripts', nome), bytes)
}
// Intervalos e nome das tarefas ficam so no Agente-Senha-Nextec.ps1 (Get-NextecAgentIntervals): o teste le de la.
writeFileSync(join(saida, 'manifesto.json'), JSON.stringify(manifesto, null, 2))
console.log('entrada gerada em ' + saida + ' (' + modelo.length + ' bytes de .cmd)')
