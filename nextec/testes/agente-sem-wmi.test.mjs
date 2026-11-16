// Regressao: com o WMI corrompido ("Classe invalida" no Win32_Service) o agente nao achava o servico, o erro virava
// protocol_error e a maquina nunca se inscrevia. As duas copias de Get-NextecInstalledClient (agente de senha e
// atualizador) precisam cair no registro de servicos quando o CIM falha. O comportamento e provado em
// nextec/atualizacao/test_client_identity.ps1 (Identity_WmiQuebrado_UsaRegistro); aqui a paridade entre as copias.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../atualizacao/', import.meta.url))

for (const arquivo of ['Agente-Senha-Nextec.ps1', 'Instalar-Nextec.ps1']) {
  test(`${arquivo}: sem WMI, descobre o servico pelo registro`, () => {
    const fonte = readFileSync(dir + arquivo, 'utf8')
    assert.ok(fonte.includes("$ServicesRegistryPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services'"))
    assert.match(fonte, /try \{ \$Services = @\(Get-CimInstance -ClassName Win32_Service -ErrorAction Stop\) \}\s*catch \{[\s\S]*?Get-ChildItem -LiteralPath \$ServicesRegistryPath/)
  })
}
