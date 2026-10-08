<template>
  <section class="nx-ss" aria-labelledby="nx-ss-title">
    <h1 id="nx-ss-title" class="nx-sr">Ajustes do servidor</h1>

    <!-- situação dos serviços -->
    <div class="nx-status">
      <div class="nx-status-item">
        <span class="nx-dot" :class="idOk === null ? 'is-wait' : idOk ? 'is-ok' : 'is-bad'" aria-hidden="true"></span>
        <div>
          <div class="nx-status-name">Servidor de ID (hbbs)</div>
          <div class="nx-status-desc">{{ statusText(idOk) }}</div>
        </div>
      </div>
      <div class="nx-status-item">
        <span class="nx-dot" :class="relayOk === null ? 'is-wait' : relayOk ? 'is-ok' : 'is-bad'" aria-hidden="true"></span>
        <div>
          <div class="nx-status-name">Relay (hbbr)</div>
          <div class="nx-status-desc">{{ statusText(relayOk) }}</div>
        </div>
      </div>
      <el-button :loading="checking" @click="checkAll">Verificar de novo</el-button>
    </div>

    <el-alert v-if="idOk === false || relayOk === false" type="warning" show-icon :closable="false" class="nx-alert"
              title="O painel não conseguiu falar com o servidor"
              description="Os ajustes desta tela são enviados direto ao hbbs e ao hbbr. Isso só funciona quando a API e os dois serviços rodam no mesmo host, como na imagem Nextec."/>

    <el-tabs v-model="tab" class="nx-tabs">
      <el-tab-pane label="Ajustes" name="simple">
        <div class="nx-grid">
          <!-- Dados para configurar os apps -->
          <div class="nx-card nx-wide nx-serverdata">
            <div class="nx-card-head">
              <h2>Dados do servidor</h2>
              <p>Use estes dados para configurar o app RustDesk nos clientes (Configurações &gt; Rede &gt; Servidor de ID/Relay).</p>
            </div>
            <dl class="nx-kv">
              <div v-for="item in serverItems" :key="item.key" class="nx-kv-item">
                <dt>{{ item.label }}</dt>
                <dd>
                  <code>{{ item.value || '-' }}</code>
                  <el-button v-if="item.value" size="small" :aria-label="'Copiar ' + item.label" @click="copyText(item.value, item.label)">
                    <el-icon><el-icon-CopyDocument/></el-icon><span>Copiar</span>
                  </el-button>
                </dd>
              </div>
            </dl>
          </div>

          <!-- Conexão -->
          <div class="nx-card" v-loading="loading.conn">
            <div class="nx-card-head">
              <h2>Conexão</h2>
              <p>Como os apps RustDesk se conectam entre si.</p>
            </div>

            <div class="nx-field">
              <label for="nx-rs">Servidores de relay</label>
              <p class="nx-help">Endereço (host:porta) que o servidor de ID entrega aos apps para retransmitir a conexão quando o acesso direto não é possível. Para mais de um, separe por vírgula.</p>
              <div class="nx-row">
                <el-input id="nx-rs" v-model="relayServers" placeholder="ex.: acesso.nextec.com.br:21117" :disabled="!idOk"/>
                <el-button type="primary" :disabled="!idOk" :loading="saving.rs" @click="saveRelayServers">Salvar</el-button>
              </div>
              <p class="nx-env">Permanente: variável <code>RELAY</code></p>
            </div>

            <div class="nx-field nx-switch-field">
              <div>
                <label>Sempre usar relay</label>
                <p class="nx-help">Todas as conexões passam pelo relay, mesmo quando daria para conectar direto. Resolve redes com firewall restritivo, mas aumenta o uso de banda do servidor.</p>
                <p class="nx-env">Permanente: variável <code>ALWAYS_USE_RELAY=Y</code></p>
              </div>
              <el-switch v-model="alwaysRelay" :disabled="!idOk" :loading="saving.aur" aria-label="Sempre usar relay" @change="saveAlwaysRelay"/>
            </div>

            <div v-if="canMustLogin" class="nx-field nx-switch-field">
              <div>
                <label>Exigir login no app</label>
                <p class="nx-help">O app RustDesk só consegue acessar outros dispositivos depois que a pessoa entra com uma conta deste servidor.</p>
                <p class="nx-env">Permanente: variável <code>MUST_LOGIN=Y</code></p>
              </div>
              <el-switch v-model="mustLogin" :disabled="!idOk" :loading="saving.ml" aria-label="Exigir login no app" @change="saveMustLogin"/>
            </div>
          </div>

          <!-- Limites de banda -->
          <div class="nx-card" v-loading="loading.bw">
            <div class="nx-card-head">
              <h2>Limites de banda do relay</h2>
              <p>Valem só para conexões que passam pelo relay.</p>
            </div>
            <div class="nx-bw">
              <div class="nx-field" v-for="f in bwFields" :key="f.key">
                <label :for="'nx-' + f.key">{{ f.label }}</label>
                <p class="nx-help">{{ f.help }}</p>
                <el-input-number :id="'nx-' + f.key" v-model="bw[f.key]" :min="f.min" :max="f.max" :step="f.step"
                                 :disabled="!relayOk" controls-position="right"/>
                <span class="nx-unit">{{ f.unit }}</span>
                <p class="nx-env">Permanente: variável <code>{{ f.env }}</code></p>
              </div>
            </div>
            <div class="nx-actions">
              <el-button :disabled="!relayOk" @click="loadBandwidth">Recarregar</el-button>
              <el-button type="primary" :disabled="!relayOk" :loading="saving.bw" @click="saveBandwidth">Salvar limites</el-button>
            </div>
          </div>

          <!-- Uso agora -->
          <div class="nx-card nx-wide" v-loading="loading.usage">
            <div class="nx-card-head nx-head-row">
              <div>
                <h2>Conexões no relay agora</h2>
                <p>Quem está usando o relay neste momento, da que mais consome para a que menos consome.</p>
              </div>
              <el-button :disabled="!relayOk" @click="loadUsage">Atualizar</el-button>
            </div>
            <el-table v-if="usage.length" :data="usage" aria-label="Conexões no relay agora">
              <el-table-column prop="ip" label="IP" min-width="140"/>
              <el-table-column prop="time" label="Duração" min-width="100"/>
              <el-table-column prop="total" label="Transferido" min-width="110"/>
              <el-table-column prop="avg" label="Média" min-width="100"/>
              <el-table-column prop="highest" label="Pico" min-width="100"/>
              <el-table-column prop="speed" label="Agora" min-width="100"/>
            </el-table>
            <el-empty v-else :image-size="64" description="Nenhuma conexão passando pelo relay agora."/>
          </div>

          <!-- Bloqueio de IPs -->
          <div class="nx-card nx-wide" v-loading="loading.ips">
            <div class="nx-card-head">
              <h2>Controle de IPs no relay</h2>
              <p>Use para conter abuso de banda ou acessos indevidos. Informe um IP por vez.</p>
            </div>
            <div class="nx-iplists">
              <div v-for="l in ipLists" :key="l.key" class="nx-iplist">
                <h3>{{ l.title }}</h3>
                <p class="nx-help">{{ l.help }}</p>
                <div class="nx-row">
                  <el-input v-model="ipInput[l.key]" placeholder="ex.: 203.0.113.10" :disabled="!relayOk"
                            :aria-label="'IP para ' + l.title" @keyup.enter="addIp(l)"/>
                  <el-button type="primary" :disabled="!relayOk || !ipInput[l.key]" @click="addIp(l)">Adicionar</el-button>
                </div>
                <div class="nx-chips" aria-live="polite">
                  <el-tag v-for="ip in ips[l.key]" :key="ip" closable type="info" @close="removeIp(l, ip)">{{ ip }}</el-tag>
                  <span v-if="!ips[l.key].length" class="nx-none">Nenhum IP na lista.</span>
                </div>
              </div>
            </div>
            <p class="nx-env">Permanente: arquivos <code>blocklist.txt</code> e <code>blacklist.txt</code> na pasta de dados do relay, um IP por linha.</p>
          </div>

          <!-- Cliente web -->
          <div class="nx-card nx-wide">
            <div class="nx-field nx-switch-field nx-noborder">
              <div>
                <h2 class="nx-h2-inline">Acesso pelo navegador (cliente web)</h2>
                <p class="nx-help">Mostra as opções "Abrir no navegador" e "Compartilhar pelo navegador" nas listas, para acessar um dispositivo sem instalar o app RustDesk. Usa o cliente web oficial do RustDesk, com a marca dele. Vale para todos os usuários na hora.</p>
              </div>
              <el-switch v-model="webClient" :loading="saving.web" :disabled="webClientManual" aria-label="Acesso pelo navegador"
                         active-text="Ligado" inactive-text="Desligado" inline-prompt style="--el-switch-on-color: var(--nx-accent)"
                         :before-change="toggleWebClient"/>
            </div>
            <el-alert v-if="webClientManual" type="warning" show-icon :closable="false" class="nx-alert-inline"
                      title="Este servidor ainda não tem o chaveador"
                      :description="`Atualize para a imagem Nextec mais recente. Enquanto isso, defina RUSTDESK_API_APP_WEB_CLIENT=${webClient ? 0 : 1} no docker-compose e rode docker compose up -d.`"/>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Comandos avançados" name="advanced" lazy>
        <p class="nx-help nx-adv-help">Envio de comandos diretos ao hbbs e ao hbbr. Use só se souber o efeito de cada comando.</p>
        <div class="nx-advanced"><UpstreamControl/></div>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup>
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { sendCmd } from '@/api/rustdesk'
  import { setWebClient } from '@/nextec/api'
  import UpstreamControl from '@/views/rustdesk/control.vue'
  import { useAppStore } from '@/store/app'

  const ID = '21115'
  const RELAY = '21117'

  const tab = ref('simple')

  const appStore = useAppStore()

  // dados do servidor (antes ficavam no Início; agora só aqui, na área de administração)
  const serverItems = computed(() => {
    const c = appStore.setting.rustdeskConfig || {}
    return [
      { key: 'id', label: 'Servidor de ID', value: c.id_server },
      { key: 'relay', label: 'Servidor de relay', value: c.relay_server },
      { key: 'api', label: 'Servidor de API', value: c.api_server },
      { key: 'key', label: 'Chave pública', value: c.key },
    ]
  })
  const copyText = async (text, label) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success(`${label} copiado.`) } catch { ElMessage.error('Não foi possível copiar.') }
  }

  // cliente web: liga e desliga na hora (patch 0002 da API); sem ele, cai nas instruções manuais
  const webClient = ref(!!appStore.setting.appConfig?.web_client)
  watch(() => appStore.setting.appConfig?.web_client, v => { webClient.value = !!v })
  const webClientManual = ref(false)
  const toggleWebClient = async () => {
    const enabled = !webClient.value
    saving.web = true
    const res = await setWebClient({ enabled }).catch(e => ({ failed: true, status: e?.response?.status }))
    saving.web = false
    if (res?.failed) {
      if (res.status === 404) webClientManual.value = true
      else ElMessage.error('Não foi possível mudar o acesso pelo navegador.')
      return false
    }
    // o próprio interruptor muda depois deste retorno; a loja só é atualizada em seguida, para não mudar duas vezes
    nextTick(() => { appStore.setting.appConfig.web_client = enabled ? 1 : 0 })
    ElMessage.success(enabled ? 'Acesso pelo navegador ligado.' : 'Acesso pelo navegador desligado.')
    return true
  }
  const idOk = ref(null)
  const relayOk = ref(null)
  const canMustLogin = ref(false)
  const checking = ref(false)
  const loading = reactive({ conn: false, bw: false, usage: false, ips: false })
  const saving = reactive({ rs: false, aur: false, ml: false, bw: false, web: false })

  const relayServers = ref('')
  const alwaysRelay = ref(false)
  const mustLogin = ref(false)

  const bw = reactive({ tb: 0, sb: 0, ls: 0, dt: 0, t: 0 })
  const bwFields = [
    { key: 'tb', label: 'Banda total', unit: 'Mb/s', env: 'TOTAL_BANDWIDTH', min: 1, max: 100000, step: 10,
      help: 'Limite somado de todas as conexões no relay.' },
    { key: 'sb', label: 'Banda por conexão', unit: 'Mb/s', env: 'SINGLE_BANDWIDTH', min: 1, max: 10000, step: 1,
      help: 'Limite de cada conexão.' },
    { key: 'ls', label: 'Velocidade reduzida', unit: 'Mb/s', env: 'LIMIT_SPEED', min: 1, max: 10000, step: 1,
      help: 'Velocidade aplicada aos IPs da lista "velocidade reduzida" e às conexões rebaixadas.' },
    { key: 'dt', label: 'Rebaixar acima de', unit: '% da banda por conexão', env: 'DOWNGRADE_THRESHOLD', min: 1, max: 100, step: 1,
      help: 'Conexão que passar desse uso médio cai para a velocidade reduzida.' },
    { key: 't', label: 'Verificar rebaixamento após', unit: 'minutos', env: 'DOWNGRADE_START_CHECK', min: 1, max: 1440, step: 5,
      help: 'Tempo de conexão antes de começar a avaliar o rebaixamento.' },
  ]

  const usage = ref([])
  const ips = reactive({ block: [], slow: [] })
  const ipInput = reactive({ block: '', slow: '' })
  const ipLists = [
    { key: 'block', title: 'IPs bloqueados', get: 'B', add: 'Ba', remove: 'Br',
      help: 'O relay recusa qualquer conexão vinda desses IPs.' },
    { key: 'slow', title: 'IPs com velocidade reduzida', get: 'b', add: 'ba', remove: 'br',
      help: 'Conexões desses IPs ficam limitadas à velocidade reduzida.' },
  ]

  const statusText = ok => ok === null ? 'Verificando...' : ok ? 'Respondendo' : 'Sem resposta'

  const cmd = async (c, target, option) => {
    const res = await sendCmd({ cmd: c, target, option: option ?? '' }).catch(() => false)
    return res ? (res.data || '') : false
  }
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean)
  const num = s => parseFloat(String(s || '').replace(/[^\d.]/g, '')) || 0

  // ---------- leitura ----------
  const loadConn = async () => {
    loading.conn = true
    const [rs, aur, ml] = await Promise.all([cmd('rs', ID), cmd('aur', ID), canMustLogin.value ? cmd('ml', ID) : '' ])
    loading.conn = false
    if (rs !== false) relayServers.value = lines(rs).join(',')
    if (aur !== false) alwaysRelay.value = /true/.test(aur)
    if (ml) mustLogin.value = /true/.test(ml)
  }
  const loadBandwidth = async () => {
    loading.bw = true
    const [tb, sb, ls, dt, t] = await Promise.all(['tb', 'sb', 'ls', 'dt', 't'].map(c => cmd(c, RELAY)))
    loading.bw = false
    bw.tb = num(tb); bw.sb = num(sb); bw.ls = num(ls)
    bw.dt = Math.round(num(dt) * 100)
    bw.t = Math.round(num(t) / 60)
  }
  const loadUsage = async () => {
    loading.usage = true
    const u = await cmd('u', RELAY)
    loading.usage = false
    // formato: "ip: 12s 1.23MB 100kb/s 50kb/s 80kb/s" (duração, total, pico, média, agora)
    usage.value = lines(u).map(l => {
      const [ip, rest = ''] = l.split(/:\s(?=\d)/)
      const [time, total, highest, avg, speed] = rest.split(/\s+/)
      return { ip, time, total, highest, avg, speed }
    })
  }
  const loadIps = async () => {
    loading.ips = true
    const [block, slow] = await Promise.all(ipLists.map(l => cmd(l.get, RELAY)))
    loading.ips = false
    ips.block = lines(block)
    ips.slow = lines(slow)
  }

  const checkAll = async () => {
    checking.value = true
    const [h1, h2] = await Promise.all([cmd('h', ID), cmd('h', RELAY)])
    checking.value = false
    idOk.value = !!h1
    relayOk.value = !!h2
    canMustLogin.value = !!h1 && /must-login/.test(h1)
    if (idOk.value) loadConn()
    if (relayOk.value) { loadBandwidth(); loadUsage(); loadIps() }
  }

  // ---------- gravação ----------
  const ok = () => ElMessage.success('Ajuste aplicado no servidor.')
  const fail = () => ElMessage.error('O servidor não confirmou o ajuste. Tente de novo.')

  const saveRelayServers = async () => {
    const value = relayServers.value.split(',').map(s => s.trim()).filter(Boolean).join(',')
    if (!value) return ElMessage.warning('Informe pelo menos um servidor de relay.')
    saving.rs = true
    const r = await cmd('rs', ID, value)
    saving.rs = false
    r === false ? fail() : ok()
  }
  const saveAlwaysRelay = async (v) => {
    saving.aur = true
    const r = await cmd('aur', ID, v ? 'Y' : 'N')
    // o hbbs redefine a lista de relays ao mudar esse ajuste; reenviamos a lista atual (mesmo cuidado do painel original)
    if (r !== false && relayServers.value) await cmd('rs', ID, relayServers.value)
    saving.aur = false
    if (r === false) { alwaysRelay.value = !v; fail() } else ok()
  }
  const saveMustLogin = async (v) => {
    saving.ml = true
    const r = await cmd('ml', ID, v ? 'Y' : 'N')
    saving.ml = false
    if (r === false) { mustLogin.value = !v; fail() } else ok()
  }
  const saveBandwidth = async () => {
    saving.bw = true
    const results = await Promise.all([
      cmd('tb', RELAY, String(bw.tb)),
      cmd('sb', RELAY, String(bw.sb)),
      cmd('ls', RELAY, String(bw.ls)),
      cmd('dt', RELAY, String(bw.dt / 100)),
      cmd('t', RELAY, String(bw.t * 60)),
    ])
    saving.bw = false
    results.some(r => r === false) ? fail() : ok()
    loadBandwidth()
  }

  const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
  const IPV6 = /^[0-9a-f:]+$/i
  const addIp = async (l) => {
    const ip = ipInput[l.key].trim()
    if (!IPV4.test(ip) && !(ip.includes(':') && IPV6.test(ip))) return ElMessage.warning('Informe um endereço IP válido.')
    if (ips[l.key].includes(ip)) return ElMessage.info('Esse IP já está na lista.')
    const r = await cmd(l.add, RELAY, ip)
    if (r === false) return fail()
    ipInput[l.key] = ''
    ok()
    loadIps()
  }
  const removeIp = async (l, ip) => {
    const confirm = await ElMessageBox.confirm(`Remover ${ip} de "${l.title}"?`, 'Remover IP', {
      confirmButtonText: 'Remover', cancelButtonText: 'Cancelar', type: 'warning',
    }).catch(() => false)
    if (!confirm) return
    const r = await cmd(l.remove, RELAY, ip)
    r === false ? fail() : ok()
    loadIps()
  }

  onMounted(checkAll)
</script>

<style scoped lang="scss">
  .nx-ss { max-width: 1240px; margin: 0 auto; }
  .nx-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  .nx-status {
    display: flex; flex-wrap: wrap; align-items: center; gap: 16px 28px; padding: 16px 20px; margin-bottom: 16px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
    .el-button { margin-left: auto; }
  }
  .nx-status-item { display: flex; align-items: center; gap: 10px; }
  .nx-status-name { font-weight: 600; font-size: 14px; color: var(--nx-text); }
  .nx-status-desc { font-size: 12px; color: var(--nx-text-muted); }
  .nx-dot {
    width: 10px; height: 10px; border-radius: 50%; flex: none;
    &.is-ok { background: #0F7B55; box-shadow: 0 0 0 4px #D1FAE5; }
    &.is-bad { background: #BA1A1A; box-shadow: 0 0 0 4px #FFDAD6; }
    &.is-wait { background: #9A97AD; box-shadow: 0 0 0 4px var(--nx-field); }
  }
  .nx-alert { margin-bottom: 12px; border-radius: 14px; }
  .nx-tabs { margin-top: 8px; }
  .nx-tabs :deep(.el-tabs__item) { padding: 0 16px !important; font-weight: 600; }

  .nx-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .nx-wide { grid-column: 1 / -1; }
  .nx-card {
    padding: 20px 22px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
    min-width: 0;
  }
  .nx-card-head {
    margin-bottom: 16px;
    h2 { font-size: 16px; margin: 0 0 4px; }
    p { margin: 0; font-size: 13px; color: var(--nx-text-muted); }
  }
  .nx-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }

  .nx-field {
    padding: 14px 0; border-top: 1px solid var(--nx-divider);
    &:first-of-type { border-top: none; padding-top: 0; }
    label, h3 { display: block; font-size: 13px; font-weight: 700; color: var(--nx-text); margin: 0 0 2px; }
  }
  .nx-switch-field { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .nx-help { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-noborder { border: none !important; padding-top: 0 !important; margin-top: 0 !important; }
  .nx-h2-inline { margin: 0 0 4px; font-size: 16px; color: var(--nx-text); }
  .nx-alert-inline { margin-top: 12px; border-radius: 12px; }
  .nx-kv { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; }
  .nx-kv-item { min-width: 0; }
  .nx-kv dt { font-size: 12px; font-weight: 600; color: var(--nx-text-muted); margin-bottom: 4px; }
  .nx-kv dd { margin: 0; display: flex; align-items: center; gap: 8px; }
  .nx-kv code {
    flex: 1; min-width: 0; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 13px; color: var(--nx-text);
    background: var(--nx-field); border-radius: 10px; padding: 8px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  @media (max-width: 768px) { .nx-kv { grid-template-columns: minmax(0, 1fr); } }
  .nx-env { margin: 6px 0 0; font-size: 11px; color: var(--nx-text-subtle); code { font-size: 11px; background: var(--nx-field); padding: 1px 6px; border-radius: 6px; } }
  .nx-row { display: flex; gap: 8px; .el-input { flex: 1; } }
  .nx-unit { margin-left: 8px; font-size: 12px; color: var(--nx-text-muted); }
  .nx-bw .nx-field { border-top: 1px solid var(--nx-divider); }
  .nx-bw .nx-field:first-child { border-top: none; padding-top: 0; }
  .nx-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

  .nx-iplists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
  .nx-iplist h3 { font-size: 14px; }
  .nx-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; min-height: 26px; }
  .nx-none { font-size: 12px; color: var(--nx-text-subtle); }
  .nx-adv-help { margin: 4px 0 12px; }

  // aba avançada: reaproveita a tela original, mostrando só a parte de comandos
  .nx-advanced {
    :deep(> div > h4), :deep(> div > h5) { display: none; }
    :deep(.el-tabs__header) { display: none; }
    :deep(#pane-Simple) { display: none !important; }
    :deep(#pane-Advanced) { display: block !important; }
  }

  @media (max-width: 900px) {
    .nx-grid, .nx-iplists { grid-template-columns: minmax(0, 1fr); }
    .nx-status .el-button { margin-left: 0; }
  }
</style>
