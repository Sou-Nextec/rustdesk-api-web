<template>
  <section class="nx-sec" aria-label="Senhas dos servidores">
    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar máquina, ID ou cliente" aria-label="Buscar máquina">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-button @click="rules.visible = true">Regras</el-button>
        <el-button @click="openAudit">Auditoria</el-button>
        <el-button @click="openKey">Credencial de inscrição</el-button>
        <el-button @click="openAgent">Autorização individual</el-button>
        <el-button type="primary" @click="openAdd"><el-icon><el-icon-Plus/></el-icon><span>Ligar em uma máquina</span></el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="Instalou, a máquina aparece em Pendentes, você atribui a um cliente."
      description="O instalador é o mesmo para todos os clientes. A máquina se inscreve sozinha como pendente, sem senha e sem acesso. Só depois que você a atribui a um cliente (aba Pendentes) o cofre passa a gerar a senha e o botão Conectar a preenche, para quem tem acesso ao cliente. A autorização individual de 15 minutos continua disponível para casos especiais."
      class="nx-agent-help"
    />
    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      show-icon
      title="Não foi possível carregar as máquinas."
      description="Confira a conexão com o painel e tente de novo."
      class="nx-agent-help"
    >
      <el-button size="small" :loading="loading" @click="load">Tentar de novo</el-button>
    </el-alert>

    <el-tabs v-model="tab" class="nx-tabs">
      <el-tab-pane name="machines" label="Máquinas"/>
      <el-tab-pane name="pending">
        <template #label>
          <span>Pendentes</span>
          <el-badge v-if="pendingCount" :value="pendingCount" class="nx-badge"/>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- pendentes: inscritas sozinhas, aguardando atribuição a um cliente -->
    <div v-if="tab === 'pending'" class="nx-card">
      <el-table :data="pendingRows" v-loading="loading" row-key="peer_id" aria-label="Máquinas pendentes" empty-text=" ">
        <el-table-column label="Máquina" min-width="190">
          <template #default="{ row }">
            <div class="nx-name">{{ row.alias || row.hostname || fmtId(row.peer_id) }}</div>
            <div class="nx-muted nx-small nx-mono">{{ fmtId(row.peer_id) }}</div>
            <el-tooltip v-if="row.stale_key" placement="top"
                        content="Inscrita com uma credencial que já foi girada. Se você reconhece a máquina, atribua normalmente; se não, rejeite ou bloqueie.">
              <el-tag type="warning" size="small" disable-transitions class="nx-stale-tag">Chave anterior</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="Sistema e usuário" min-width="170">
          <template #default="{ row }">
            <div>{{ row.os || '-' }}</div>
            <div class="nx-muted nx-small">{{ row.username || 'usuário não informado' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Origem" min-width="130">
          <template #default="{ row }"><span class="nx-mono nx-small">{{ row.last_ip || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="Inscrita" min-width="130">
          <template #default="{ row }">
            <div>{{ ago(row.enrolled_at) }}</div>
            <div class="nx-muted nx-small">{{ viaText[row.enrolled_via] || 'Inscrição global' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="270" fixed="right">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" type="primary" @click="openAssign(row)">Atribuir</el-button>
              <el-button size="small" @click="rejectRow(row, false)">Rejeitar</el-button>
              <el-button size="small" @click="rejectRow(row, true)"><span class="nx-danger-text">Bloquear</span></el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !pendingRows.length" :image-size="72"
                :description="pendingAll.length ? 'Nenhuma máquina encontrada.' : 'Nenhuma máquina aguardando atribuição.'">
        <p v-if="!pendingAll.length">Quando alguém instalar o Nextec-Connect com a credencial de inscrição, a máquina aparece aqui para você atribuir a um cliente.</p>
        <el-button v-if="!pendingAll.length" @click="openKey">Ver credencial de inscrição</el-button>
      </el-empty>
      <p v-if="staleCount" class="nx-help nx-small">
        {{ staleCount }} {{ staleCount === 1 ? 'máquina foi inscrita' : 'máquinas foram inscritas' }} com uma credencial anterior (selo “Chave anterior”).
        Elas continuam aqui até você atribuir, rejeitar ou bloquear. Só as inscrições novas exigem a credencial atual.
      </p>
      <div class="nx-foot">
        <el-button text :disabled="!blocked.length" @click="blockedDlg.visible = true">Bloqueadas ({{ blocked.length }})</el-button>
      </div>
    </div>

    <div v-else class="nx-card">
      <el-table :data="pageRows" v-loading="loading" row-key="peer_id" aria-label="Máquinas com senha automática" empty-text=" ">
        <el-table-column label="Máquina" min-width="190">
          <template #default="{ row }">
            <div class="nx-name">{{ row.alias || row.hostname || fmtId(row.peer_id) }}</div>
            <div class="nx-muted nx-small nx-mono">{{ fmtId(row.peer_id) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Cliente" min-width="150">
          <template #default="{ row }">
            <el-tag v-if="groupName(row.group_id)" disable-transitions>{{ groupName(row.group_id) }}</el-tag>
            <span v-else class="nx-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="Senha automática" min-width="150">
          <template #default="{ row }">
            <template v-if="row.managed && row.enrolled">
              <span><span class="nx-dot is-on" aria-hidden="true"></span>Ligada, troca a cada {{ every(row.interval_minutes) }}</span>
            </template>
            <el-tooltip v-else-if="row.managed" content="A regra está configurada, mas só começa a trocar a senha depois que o agente Nextec for instalado nesta máquina." placement="top">
              <span class="nx-warn-text"><span class="nx-dot is-warn" aria-hidden="true"></span>Regra pronta · agente pendente</span>
            </el-tooltip>
            <span v-else class="nx-muted"><span class="nx-dot is-off" aria-hidden="true"></span>Desligada</span>
          </template>
        </el-table-column>
        <el-table-column label="Agente" min-width="150">
          <template #default="{ row }">
            <template v-if="row.enrolled">
              <span class="nx-dot" :class="seenRecently(row) ? 'is-on' : 'is-warn'" aria-hidden="true"></span>
              <span>{{ seenRecently(row) ? 'Ativo' : 'Sem contato' }}</span>
              <div class="nx-muted nx-small">visto {{ ago(row.last_seen_at) }}</div>
              <div v-if="row.enrolled_via" class="nx-muted nx-small">{{ viaText[row.enrolled_via] }}</div>
            </template>
            <el-tooltip v-else content="O agente ainda não foi cadastrado nesta máquina. Use Cadastrar máquina e execute o comando no servidor como administrador." placement="top">
              <span class="nx-warn-text">Agente não cadastrado</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="Senha" min-width="170">
          <template #default="{ row }">
            <template v-if="row.has_password">
              <div>Versão {{ row.version }}, trocada {{ ago(row.active_at) }}</div>
              <div class="nx-muted nx-small">{{ row.managed ? 'próxima ' + until(row.next_rotation_at) : 'regra desligada' }}</div>
            </template>
            <span v-else class="nx-muted">{{ row.managed && !row.enrolled ? 'Aguardando instalação do agente' : row.enrolled && row.managed ? 'Aguardando a primeira troca' : 'Sem senha ainda' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="260" fixed="right">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-tooltip :content="secretActionState(row).revealReason" :disabled="secretActionState(row).canReveal" placement="top">
                <span class="nx-disabled-action"><el-button size="small" :disabled="!secretActionState(row).canReveal" @click="reveal(row)">Ver senha</el-button></span>
              </el-tooltip>
              <el-tooltip :content="secretActionState(row).rotateReason" :disabled="secretActionState(row).canRotate" placement="top">
                <span class="nx-disabled-action"><el-button size="small" :disabled="!secretActionState(row).canRotate" @click="rotate(row)">Trocar agora</el-button></span>
              </el-tooltip>
              <el-dropdown trigger="click" @command="cmd => onRow(cmd, row)">
                <el-button size="small" aria-label="Mais ações"><el-icon><el-icon-MoreFilled/></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="!row.managed" command="on">Ligar nesta máquina</el-dropdown-item>
                    <el-dropdown-item v-else command="off">Desligar nesta máquina</el-dropdown-item>
                    <el-dropdown-item v-if="row.enrolled" command="unenroll" divided><span class="nx-danger-text">Remover agente</span></el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !filtered.length" :image-size="72"
                :description="devices.length ? 'Nenhuma máquina encontrada.' : 'Nenhuma máquina com senha automática ainda.'">
        <p v-if="!devices.length">Ligue a regra em um grupo (por exemplo, Servidores de cada cliente) ou em uma máquina e instale o agente nela.</p>
        <el-button v-if="!devices.length" type="primary" @click="rules.visible = true">Abrir regras</el-button>
      </el-empty>
      <div v-if="filtered.length > pageSize" class="nx-pager">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" layout="total, prev, pager, next" :total="filtered.length" background/>
      </div>
    </div>

    <!-- atribuir a um cliente -->
    <el-dialog v-model="assign.visible" class="nx-dlg" title="Atribuir a um cliente" width="min(560px, 92vw)">
      <p class="nx-help nx-help-top">
        {{ assign.name }} ({{ fmtId(assign.peer) }}). Só depois de atribuir, o cofre passa a gerar e liberar a senha desta máquina.
      </p>
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Cliente" required class="is-required">
          <el-select v-model="assign.client" filterable placeholder="Escolha o cliente">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id"/>
          </el-select>
        </el-form-item>
        <el-form-item label="Senha automática">
          <el-radio-group v-model="assign.rule" class="nx-radios">
            <el-radio value="group">Usar a regra do cliente</el-radio>
            <el-radio value="peer">Regra só desta máquina</el-radio>
            <el-radio value="none">Não ligar agora</el-radio>
          </el-radio-group>
          <p v-if="assign.rule === 'group' && assign.client && !groupRuleOn" class="nx-help nx-warn-text" role="alert">
            Este cliente não tem regra de senha ligada. Escolha a regra da máquina ou ligue a regra do cliente em Regras.
          </p>
        </el-form-item>
        <el-form-item v-if="assign.rule === 'peer'" label="Trocar a cada">
          <el-select v-model="assign.interval"><el-option v-for="o in intervals" :key="o.value" :label="o.label" :value="o.value"/></el-select>
        </el-form-item>
        <el-form-item v-if="assignOtherClient">
          <el-checkbox v-model="assign.move">Esta máquina já está em "{{ groupName(assign.currentGroup) }}". Mover para o cliente escolhido.</el-checkbox>
        </el-form-item>
      </el-form>
      <p class="nx-help">
        O técnico acessa pela lista "Cliente: nome do cliente", em
        <router-link to="/user/clientAccess" @click="assign.visible = false">Acesso por cliente</router-link>.
      </p>
      <p v-if="assign.error" class="nx-error" role="alert">{{ assign.error }}</p>
      <template #footer>
        <el-button @click="assign.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="assign.loading" :disabled="!canAssign" @click="doAssign">Atribuir</el-button>
      </template>
    </el-dialog>

    <!-- credencial de inscrição -->
    <el-dialog v-model="keyDlg.visible" class="nx-dlg" title="Credencial de inscrição" width="min(620px, 92vw)">
      <p class="nx-help nx-help-top">
        É a credencial que vai dentro do instalador global. Com ela, a máquina se inscreve como pendente e nada mais: não recebe senha nem acesso.
        Trate como segredo interno e gire se achar que vazou.
      </p>
      <p v-if="keyDlg.error" class="nx-error" role="alert">{{ keyDlg.error }}</p>
      <div class="nx-pw">
        <code>{{ keyDlg.loading ? 'carregando...' : (keyDlg.show ? keyDlg.key : maskedKey) || 'indisponível' }}</code>
        <el-button size="small" :disabled="!keyDlg.key" @click="keyDlg.show = !keyDlg.show">{{ keyDlg.show ? 'Ocultar' : 'Ver' }}</el-button>
        <el-button size="small" :disabled="!keyDlg.key" @click="copy(keyDlg.key)">Copiar</el-button>
      </div>
      <p class="nx-help">Versão {{ keyDlg.epoch || '-' }}. Girar invalida a credencial atual: instaladores já distribuídos deixam de inscrever máquinas novas. As pendentes feitas com ela continuam na lista, marcadas como “Chave anterior”, e você ainda pode atribuí-las, rejeitá-las ou bloqueá-las. Máquinas já atribuídas não são afetadas.</p>
      <template #footer>
        <el-button type="danger" plain :loading="keyDlg.rotating" @click="rotateKey">Girar credencial</el-button>
        <el-button type="primary" @click="keyDlg.visible = false">Fechar</el-button>
      </template>
    </el-dialog>

    <!-- bloqueadas -->
    <el-dialog v-model="blockedDlg.visible" class="nx-dlg" title="Máquinas bloqueadas" width="min(560px, 92vw)">
      <el-table :data="blocked" empty-text="Nenhuma máquina bloqueada." aria-label="Máquinas bloqueadas">
        <el-table-column label="Máquina" min-width="150"><template #default="{ row }"><span class="nx-mono">{{ fmtId(row.peer_id) }}</span></template></el-table-column>
        <el-table-column label="Bloqueada" min-width="150"><template #default="{ row }">{{ ago(row.blocked_at) }}</template></el-table-column>
        <el-table-column label="" width="130">
          <template #default="{ row }"><el-button size="small" @click="unblock(row)">Desbloquear</el-button></template>
        </el-table-column>
      </el-table>
      <template #footer><el-button type="primary" @click="blockedDlg.visible = false">Fechar</el-button></template>
    </el-dialog>

    <!-- ver senha -->
    <el-dialog v-model="show.visible" class="nx-dlg" title="Senha atual" width="460px">
      <p class="nx-help nx-help-top">{{ show.name }}. Esta consulta fica registrada na auditoria. A senha vale só para liberar a conexão pelo RustDesk, não é a senha do Windows.</p>
      <div class="nx-pw">
        <code>{{ show.password || 'ainda não confirmada' }}</code>
        <el-button v-if="show.password" size="small" @click="copy(show.password)">Copiar</el-button>
      </div>
      <p v-if="show.pending" class="nx-help">Há uma troca em andamento (senha pendente): <code>{{ show.pending }}</code>. Se a atual não funcionar, tente esta.</p>
      <template #footer><el-button type="primary" @click="show.visible = false">Fechar</el-button></template>
    </el-dialog>

    <!-- regras por grupo -->
    <el-dialog v-model="rules.visible" class="nx-dlg" title="Regras de senha automática" width="680px">
      <p class="nx-help nx-help-top">Máquinas dos grupos ligados abaixo passam a trocar a senha sozinhas, no intervalo escolhido. Uma regra na própria máquina vale mais que a do grupo.</p>
      <el-table :data="groupPolicies" empty-text="Nenhum grupo ligado ainda." aria-label="Regras por grupo">
        <el-table-column label="Grupo" min-width="200">
          <template #default="{ row }">{{ groupName(Number(row.ref)) || 'grupo ' + row.ref }}</template>
        </el-table-column>
        <el-table-column label="Ligada" width="90">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" aria-label="Ligada" @change="savePolicy(row)"/>
          </template>
        </el-table-column>
        <el-table-column label="Trocar a cada" width="150">
          <template #default="{ row }">
            <el-select v-model="row.interval_minutes" aria-label="Intervalo" @change="savePolicy(row)">
              <el-option v-for="o in intervals" :key="o.value" :label="o.label" :value="o.value"/>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="" width="90">
          <template #default="{ row }"><el-button size="small" text type="danger" @click="removePolicy(row)">Remover</el-button></template>
        </el-table-column>
      </el-table>
      <div class="nx-add-group">
        <el-select v-model="rules.group" filterable placeholder="Escolha um grupo (cliente ou subgrupo) para ligar" aria-label="Grupo">
          <el-option v-for="g in groups.filter(g => !groupPolicies.some(p => Number(p.ref) === g.id))" :key="g.id" :label="g.name" :value="g.id"/>
        </el-select>
        <el-select v-model="rules.interval" aria-label="Intervalo" style="width: 150px">
          <el-option v-for="o in intervals" :key="o.value" :label="o.label" :value="o.value"/>
        </el-select>
        <el-button type="primary" :disabled="!rules.group" @click="addGroupRule">Ligar</el-button>
      </div>
      <template #footer><el-button type="primary" @click="rules.visible = false">Fechar</el-button></template>
    </el-dialog>

    <!-- ligar em uma máquina -->
    <el-dialog v-model="add.visible" class="nx-dlg" title="Ligar em uma máquina" width="520px">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Máquina" required class="is-required">
          <el-select v-model="add.peer" filterable remote :remote-method="searchPeers" :loading="add.loading" placeholder="Busque por ID, apelido ou nome">
            <el-option v-for="p in add.options" :key="p.id" :label="`${p.alias || p.hostname || p.id} (${p.id})`" :value="p.id"/>
          </el-select>
        </el-form-item>
        <el-form-item label="Trocar a cada">
          <el-select v-model="add.interval"><el-option v-for="o in intervals" :key="o.value" :label="o.label" :value="o.value"/></el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="add.visible = false">Cancelar</el-button>
        <el-button type="primary" :disabled="!add.peer" @click="saveAdd">Ligar</el-button>
      </template>
    </el-dialog>

    <!-- cadastrar máquina (agente) -->
    <el-dialog v-model="agent.visible" class="nx-dlg" title="Ativar gerenciamento" width="min(620px, 92vw)">
      <p class="nx-help nx-help-top">Autorize uma máquina já vinculada ao cliente. A autorização vale por 15 minutos e somente para o ID escolhido.</p>
      <el-select v-model="agent.peer" filterable placeholder="Selecione a máquina" style="width:100%" :disabled="agent.loading">
        <el-option v-for="d in devices.filter(d => d.group_id && !d.enrolled)" :key="d.peer_id" :value="d.peer_id" :label="`${d.alias || d.hostname || 'Máquina'} · ${fmtId(d.peer_id)}`" />
      </el-select>
      <p class="nx-help">Se a máquina não aparece, vincule-a a um cliente em Dispositivos. O app precisa estar instalado como serviço.</p>
      <el-button type="primary" :loading="agent.loading" :disabled="!agent.peer" @click="downloadActivation">Baixar autorização da máquina</el-button>
      <p class="nx-help">Na sessão confiável do AnyDesk ou RustDesk, abra o assistente local de ativação como administrador e entregue esta autorização. Depois, cadastro, senha e verificações são automáticos. Não envie o arquivo por um link público.</p>
      <p v-if="agent.error" class="nx-error" role="alert">{{ agent.error }}</p>
      <template #footer><el-button type="primary" @click="agent.visible = false">Fechar</el-button></template>
    </el-dialog>

    <!-- auditoria -->
    <el-dialog v-model="audit.visible" class="nx-dlg" title="Auditoria das senhas" width="820px">
      <el-table :data="audit.list" v-loading="audit.loading" max-height="420" empty-text="Nenhum evento." aria-label="Auditoria">
        <el-table-column label="Quando" width="170"><template #default="{ row }">{{ when(row.at) }}</template></el-table-column>
        <el-table-column label="Quem" width="160"><template #default="{ row }">{{ row.username || 'agente' }}</template></el-table-column>
        <el-table-column label="O quê" width="170"><template #default="{ row }">{{ actionText[row.action] || row.action }}</template></el-table-column>
        <el-table-column label="Máquina" prop="peer_id" min-width="130"/>
        <el-table-column label="Origem" prop="ip" min-width="120"/>
      </el-table>
      <template #footer><el-button type="primary" @click="audit.visible = false">Fechar</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { fmtId, rawId } from '@/nextec/id'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { secretActionState, assignPayload, pendingSummary } from '@/nextec/secret-actions.mjs'
  import { list as groupList } from '@/api/device_group'
  import { list as peerList } from '@/api/peer'
  import { timeAgo } from '@/utils/time'
  import {
    secretsOverview, secretsPolicy, secretsRotate, secretsReveal, secretsUnenroll, secretsBootstrap, secretsAudit,
    secretsAssign, secretsReject, secretsUnblock, enrollKeyGet, enrollKeyRotate,
  } from '@/nextec/api'
  import { activationBundle, downloadLocalJson } from '@/nextec/local-requests.mjs'
  import '../list-page.scss'

  const loading = ref(false)
  const q = ref('')
  const devices = ref([])
  const policies = ref([])
  const groups = ref([])
  const agentKeySet = ref(false)
  const blocked = ref([])
  const pendingCount = ref(0)
  const staleCount = ref(0)
  const loadError = ref(false)
  const tab = ref('machines')
  const viaText = { self: 'Inscrição global', bootstrap: 'Autorização individual', legacy: 'Chave do agente' }

  const intervals = [
    { value: 15, label: '15 minutos' }, { value: 60, label: '1 hora' }, { value: 180, label: '3 horas' },
    { value: 360, label: '6 horas' }, { value: 720, label: '12 horas' }, { value: 1440, label: '24 horas' },
  ]
  const every = (m) => (m % 60 === 0 ? (m / 60 === 1 ? 'hora' : `${m / 60} h`) : `${m} min`)

  const load = async () => {
    loading.value = true
    const [ov, g] = await Promise.all([secretsOverview().catch(() => false), groupList({ page: 1, page_size: 9999 }).catch(() => false)])
    loading.value = false
    loadError.value = !ov
    if (ov) {
      devices.value = ov.data.devices || []
      policies.value = (ov.data.policies || []).map(p => ({ ...p }))
      agentKeySet.value = !!ov.data.agent_key_set
      blocked.value = ov.data.blocked || []
      const sum = pendingSummary(devices.value)
      pendingCount.value = Number(ov.data.pending_count) || sum.total
      staleCount.value = Number(ov.data.stale_count) || sum.stale
    }
    if (g) groups.value = g.data.list || []
  }
  onMounted(load)

  const groupName = id => (id && groups.value.find(g => g.id === id)?.name) || ''
  const groupPolicies = computed(() => policies.value.filter(p => p.kind === 'group'))

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const pendingAll = computed(() => devices.value.filter(d => d.state === 'pending'))
  const pendingRows = computed(() => {
    const t = norm(q.value.trim())
    return pendingAll.value.filter(d => !t || [d.peer_id, d.alias, d.hostname, d.os, d.username, d.last_ip].some(v => norm(v).includes(t)))
      .sort((a, b) => (b.enrolled_at || 0) - (a.enrolled_at || 0))
  })
  const filtered = computed(() => {
    const t = norm(q.value.trim())
    return devices.value.filter(d => d.state !== 'pending').filter(d => !t || [d.peer_id, d.alias, d.hostname, groupName(d.group_id)].some(v => norm(v).includes(t)))
      .sort((a, b) => String(a.alias || a.hostname || a.peer_id).localeCompare(String(b.alias || b.hostname || b.peer_id), 'pt-BR'))
  })
  const page = ref(1)
  const pageSize = ref(20)
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

  const ago = (t) => (t ? timeAgo(t * 1000) : 'nunca')
  const seenRecently = d => d.last_seen_at && (Date.now() / 1000 - d.last_seen_at) < 20 * 60
  const until = (t) => {
    if (!t) return 'em breve'
    const m = Math.round((t - Date.now() / 1000) / 60)
    if (m <= 0) return 'na próxima verificação'
    return m < 90 ? `em ${m} min` : `em ${Math.round(m / 60)} h`
  }
  const when = (t) => new Date(t * 1000).toLocaleString('pt-BR')
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success('Copiado.') } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }

  // ---------- ver senha ----------
  const show = reactive({ visible: false, name: '', password: '', pending: '' })
  const reveal = async (row) => {
    const c = await ElMessageBox.confirm('Ver a senha desta máquina fica registrado na auditoria, com o seu nome. Continuar?', 'Ver senha',
      { confirmButtonText: 'Ver senha', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const r = await secretsReveal(row.peer_id).catch(() => false)
    if (r) Object.assign(show, { visible: true, name: row.alias || row.hostname || row.peer_id, password: r.data.password || '', pending: r.data.pending || '' })
  }
  const rotate = async (row) => {
    const r = await secretsRotate(row.peer_id).catch(() => false)
    if (r) ElMessage.success('A senha será trocada na próxima verificação do agente (até 5 minutos).')
  }

  // ---------- regras ----------
  const rules = reactive({ visible: false, group: null, interval: 180 })
  const savePolicy = async (p) => {
    const r = await secretsPolicy({ kind: p.kind, ref: p.ref, enabled: p.enabled, interval_minutes: p.interval_minutes }).catch(() => false)
    if (r) { ElMessage.success('Regra salva.'); load() }
  }
  const addGroupRule = async () => {
    const r = await secretsPolicy({ kind: 'group', ref: String(rules.group), enabled: true, interval_minutes: rules.interval }).catch(() => false)
    if (r) { rules.group = null; ElMessage.success('Grupo ligado.'); load() }
  }
  const removePolicy = async (p) => {
    const r = await secretsPolicy({ kind: p.kind, ref: p.ref, remove: true }).catch(() => false)
    if (r) { ElMessage.success('Regra removida.'); load() }
  }
  const onRow = async (cmd, row) => {
    if (cmd === 'on' || cmd === 'off') {
      const r = await secretsPolicy({ kind: 'peer', ref: row.peer_id, enabled: cmd === 'on', interval_minutes: row.interval_minutes || 180 }).catch(() => false)
      if (r) { ElMessage.success(cmd === 'on' ? 'Senha automática ligada.' : 'Senha automática desligada.'); load() }
    }
    if (cmd === 'unenroll') {
      const c = await ElMessageBox.confirm('Remove o agente e apaga as senhas guardadas desta máquina. A senha que está nela continua valendo até você trocá-la ou reinstalar o agente.',
        'Remover agente', { confirmButtonText: 'Remover', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
      if (!c) return
      if (await secretsUnenroll(row.peer_id).catch(() => false)) { ElMessage.success('Agente removido.'); load() }
    }
  }

  // ---------- pendentes: atribuir, rejeitar, bloquear ----------
  const assign = reactive({ visible: false, loading: false, error: '', peer: '', name: '', client: null, rule: 'group', interval: 180, move: false, currentGroup: 0, uuid: '' })
  const openAssign = (row) => {
    Object.assign(assign, {
      visible: true, loading: false, error: '', peer: row.peer_id, name: row.alias || row.hostname || 'Máquina',
      client: row.group_id || null, rule: 'group', interval: 180, move: false, currentGroup: row.group_id || 0, uuid: row.uuid || '',
    })
  }
  const groupRuleOn = computed(() => policies.value.some(p => p.kind === 'group' && Number(p.ref) === assign.client && p.enabled))
  const assignOtherClient = computed(() => !!assign.currentGroup && !!assign.client && assign.client !== assign.currentGroup)
  const canAssign = computed(() => !!assign.client && !(assign.rule === 'group' && !groupRuleOn.value) && (!assignOtherClient.value || assign.move))
  const doAssign = async () => {
    assign.loading = true
    assign.error = ''
    try {
      const r = await secretsAssign(assignPayload(assign))
      assign.visible = false
      ElMessage.success(`${assign.name} foi atribuída a ${groupName(assign.client)}. A senha é gerada na próxima verificação do agente (até 5 minutos).`)
      if (r && r.data && r.data.already) ElMessage.info('Esta máquina já estava atribuída a este cliente.')
      load()
    } catch (e) {
      assign.error = (e && e.message) || 'Não foi possível atribuir. Atualize a lista e tente de novo.'
    } finally { assign.loading = false }
  }
  const rejectRow = async (row, block) => {
    const name = row.alias || row.hostname || fmtId(row.peer_id)
    const text = block
      ? `Bloquear ${name} impede que esta máquina se inscreva de novo (o ID e a identidade dela ficam na lista de bloqueadas). Você pode desbloquear depois.`
      : `Rejeitar ${name} remove a inscrição. Se o instalador continuar nela, a máquina volta a aparecer aqui. Para impedir de vez, use Bloquear.`
    const c = await ElMessageBox.confirm(text, block ? 'Bloquear máquina' : 'Rejeitar máquina',
      { confirmButtonText: block ? 'Bloquear' : 'Rejeitar', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    if (await secretsReject(row.peer_id, block, row.uuid).catch(() => false)) {
      ElMessage.success(block ? 'Máquina bloqueada.' : 'Inscrição rejeitada.')
      load()
    }
  }
  const unblock = async (row) => {
    if (await secretsUnblock(row.peer_id, row.uuid).catch(() => false)) { ElMessage.success('Máquina desbloqueada.'); load() }
  }

  // ---------- credencial de inscrição ----------
  const keyDlg = reactive({ visible: false, loading: false, rotating: false, error: '', key: '', epoch: 0, show: false })
  const maskedKey = computed(() => (keyDlg.key ? keyDlg.key.split('.').slice(0, 2).join('.') + '.' + '•'.repeat(24) : ''))
  const openKey = async () => {
    Object.assign(keyDlg, { visible: true, loading: true, error: '', key: '', show: false })
    const r = await enrollKeyGet().catch(() => false)
    keyDlg.loading = false
    if (r) Object.assign(keyDlg, { key: r.data.key, epoch: r.data.epoch })
    else keyDlg.error = 'Não foi possível ler a credencial. Tente de novo.'
  }
  const rotateKey = async () => {
    const c = await ElMessageBox.confirm('Girar invalida a credencial atual. Instaladores já distribuídos deixam de inscrever máquinas novas. As pendentes feitas com ela continuam na lista, marcadas como “Chave anterior”, para você atribuir, rejeitar ou bloquear. Máquinas já atribuídas continuam funcionando. Continuar?',
      'Girar credencial de inscrição', { confirmButtonText: 'Girar', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    keyDlg.rotating = true
    const r = await enrollKeyRotate().catch(() => false)
    keyDlg.rotating = false
    if (r) {
      Object.assign(keyDlg, { key: r.data.key, epoch: r.data.epoch, show: false, error: '' })
      ElMessage.success('Credencial girada. Gere um instalador novo com a credencial atual.')
      load()
    }
  }

  // ---------- ligar em uma máquina ----------
  const add = reactive({ visible: false, peer: null, interval: 180, options: [], loading: false })
  const openAdd = () => { Object.assign(add, { visible: true, peer: null, interval: 180, options: [] }); searchPeers('') }
  const searchPeers = async (term) => {
    add.loading = true
    const r = await peerList({ page: 1, page_size: 30, id: term || undefined }).catch(() => false)
    add.loading = false
    add.options = r ? (r.data.list || []) : []
  }
  const saveAdd = async () => {
    const r = await secretsPolicy({ kind: 'peer', ref: add.peer, enabled: true, interval_minutes: add.interval }).catch(() => false)
    if (r) { add.visible = false; ElMessage.success('Senha automática ligada. Instale o agente na máquina, se ainda não instalou.'); load() }
  }

  // ---------- agente ----------
  const agent = reactive({ visible: false, loading: false, peer: '', error: '' })
  const openAgent = () => { Object.assign(agent, { visible: true, peer: '', error: '' }) }
  const downloadActivation = async () => {
    agent.loading = true
    agent.error = ''
    try {
      const id = String(agent.peer)
      const r = await secretsBootstrap(id)
      downloadLocalJson('bootstrap.json', activationBundle(r.data, id))
      ElMessage.success('Autorização baixada. Use em até 15 minutos na máquina escolhida.')
    } catch (e) { agent.error = e.message || 'Não foi possível autorizar esta máquina.' }
    finally { agent.loading = false }
  }

  // ---------- auditoria ----------
  const actionText = {
    connect: 'Conectou com a senha', reveal: 'Viu a senha', rotated: 'Senha trocada', rotate_now: 'Pediu troca imediata',
    policy_set: 'Mudou a regra', policy_remove: 'Removeu a regra', unenroll: 'Removeu o agente', agent_enroll: 'Agente cadastrado',
    agent_key_new: 'Gerou chave de cadastro',
    self_enroll: 'Máquina se inscreveu', enroll_assign: 'Atribuiu a um cliente', enroll_rule_change: 'Mudou a regra da máquina', enroll_identity_conflict: 'Recusou: identidade da máquina mudou',
    agent_identity_conflict: 'Agente recusado: identidade da máquina mudou', enroll_reject: 'Rejeitou inscrição',
    enroll_block: 'Bloqueou máquina', enroll_unblock: 'Desbloqueou máquina', enroll_key_rotate: 'Girou a credencial de inscrição',
    agent_bootstrap_issue: 'Autorização individual emitida', agent_bootstrap_enroll: 'Agente cadastrado (autorização individual)',
    app_policy_set: 'Mudou a política do app', app_policy_remove: 'Removeu a política do app', session_disconnect: 'Derrubou uma conexão',
    install_revoke: 'Invalidou comandos de instalação', ticket_settings: 'Mudou o pedido de chamado',
    support_upload: 'Enviou o app de suporte', support_delete: 'Tirou o app de suporte do ar', update_upload: 'Enviou versão do app', update_publish: 'Mudou a publicação do app', update_delete: 'Excluiu versão do app',
  }
  const audit = reactive({ visible: false, loading: false, list: [] })
  const openAudit = async () => {
    audit.visible = true
    audit.loading = true
    const r = await secretsAudit().catch(() => false)
    audit.loading = false
    audit.list = r ? (r.data.list || []) : []
  }
</script>

<style scoped lang="scss">
  .nx-bar {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 16px 18px; margin-bottom: 12px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
  }
  .nx-search { flex: 1 1 260px; max-width: 360px; }
  .nx-bar-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; .el-button + .el-button { margin-left: 0; } }
  .nx-agent-help { margin-bottom: 12px; }
  .nx-tabs { margin-bottom: 4px; }
  .nx-tabs :deep(.el-tabs__item) { padding: 0 16px !important; font-weight: 600; }
  .nx-badge { margin-left: 6px; vertical-align: middle; }
  .nx-stale-tag { margin-top: 4px; }
  .nx-foot { padding: 8px 14px; border-top: 1px solid var(--nx-divider); }
  .nx-radios { display: flex; flex-direction: column; align-items: flex-start; }
  .nx-error { margin: 10px 0 0; font-size: 13px; color: #B3261E; }
  .nx-danger-text { color: #B3261E; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-name { font-weight: 600; color: var(--nx-text); }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
  .nx-warn-text { color: #8A5300; }
  .nx-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle;
    &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-off { background: #9A97AD; }
    &.is-warn { background: #9A5B00; box-shadow: 0 0 0 3px #FEF3C7; }
  }
  .nx-row-actions { display: flex; gap: 6px; flex-wrap: nowrap; .el-button { margin: 0 !important; } }
  .nx-disabled-action { display: inline-flex; }
  .nx-pager { padding: 12px 18px; border-top: 1px solid var(--nx-divider); display: flex; justify-content: flex-end; }
  .nx-help { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-help-top { margin: 0 0 14px; font-size: 13px; }
  .nx-pw { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 12px; background: var(--nx-field);
    code { flex: 1; font-size: 16px; letter-spacing: .04em; word-break: break-all; color: var(--nx-text); } }
  .nx-add-group { display: flex; gap: 8px; margin-top: 14px; .el-select:first-child { flex: 1; min-width: 0; } .el-button { margin: 0; } }
  .nx-cmd { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: var(--nx-field); display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
    code { font-size: 12px; line-height: 1.5; word-break: break-all; color: var(--nx-text); } }
  .nx-form :deep(.el-select) { width: 100%; }
  @media (max-width: 768px) {
    .nx-search { max-width: none; flex: 1 1 100%; }
    .nx-bar-right { margin-left: 0; width: 100%; }
    .nx-add-group { flex-direction: column; }
  }
  html.dark .nx-warn-text { color: #FCD38A; }
  html.dark .nx-error, html.dark .nx-danger-text { color: #FFB4AB; }
</style>
