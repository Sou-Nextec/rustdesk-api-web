<template>
  <section class="nx-sec" aria-label="Senhas dos servidores">
    <div v-if="loaded && !loadError" class="nx-hero" role="status">
      <div class="nx-hero-text">
        <h2 class="nx-hero-title">{{ summary.text }}</h2>
        <ul v-if="summary.total" class="nx-chips" aria-label="Resumo das máquinas">
          <li v-if="summary.counts.client" class="nx-chip is-warn">{{ summary.counts.client }} sem cliente</li>
          <li v-if="summary.counts.agent - summary.stalled - summary.offline" class="nx-chip is-warn">{{ summary.counts.agent - summary.stalled - summary.offline }} sem agente</li>
          <li v-if="summary.stalled" class="nx-chip is-warn">{{ summary.stalled }} {{ summary.stalled === 1 ? 'agente parado' : 'agentes parados' }}</li>
          <li v-if="summary.offline" class="nx-chip">{{ summary.offline }} {{ summary.offline === 1 ? 'máquina offline' : 'máquinas offline' }}</li>
          <li v-if="summary.counts.rule" class="nx-chip is-warn">{{ summary.counts.rule }} sem senha automática</li>
          <li v-if="summary.counts.ready" class="nx-chip is-ok">{{ summary.counts.ready }} {{ summary.counts.ready === 1 ? 'pronta' : 'prontas' }}</li>
        </ul>
      </div>
      <el-button v-if="summary.cta" type="primary" size="large" class="nx-hero-cta" @click="onCta">{{ summary.cta.label }}</el-button>
    </div>

    <section class="nx-how" aria-label="Como funciona">
      <button type="button" class="nx-how-toggle" :aria-expanded="howOpen ? 'true' : 'false'" aria-controls="nx-how-body" @click="toggleHow">
        <el-icon><el-icon-ArrowDown v-if="howOpen"/><el-icon-ArrowRight v-else/></el-icon>
        <span>Como funciona</span>
      </button>
      <ol v-show="howOpen" id="nx-how-body" class="nx-how-list">
        <li><strong>Escolha o cliente.</strong> Diga de qual cliente é a máquina.</li>
        <li><strong>Instale o agente.</strong> Baixe o arquivo, copie para o servidor e dê duplo clique como administrador. Se o agente parar de consultar o painel, use <strong>Reinstalar agente</strong> (o mesmo arquivo).</li>
        <li><strong>Ligue a senha automática.</strong> A senha troca sozinha e o botão Conectar já entra sem digitar.</li>
      </ol>
    </section>

    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar máquina, ID ou cliente" aria-label="Buscar máquina">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load()"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-dropdown trigger="click" @command="onMore">
          <el-button aria-label="Mais opções"><span>Mais</span><el-icon class="el-icon--right"><el-icon-ArrowDown/></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="rules">Regras</el-dropdown-item>
              <el-dropdown-item command="audit">Auditoria</el-dropdown-item>
              <el-dropdown-item command="key">Credencial de inscrição</el-dropdown-item>
              <el-dropdown-item command="agent">Autorização individual</el-dropdown-item>
              <el-dropdown-item command="add" divided>Ligar em uma máquina pelo ID</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      show-icon
      title="Não foi possível carregar as máquinas."
      description="Confira a conexão com o painel e tente de novo."
      class="nx-agent-help"
    >
      <el-button size="small" :loading="loading" @click="load()">Tentar de novo</el-button>
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
            <div class="nx-muted nx-small nx-next-check">{{ nextCheckText(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Próximo passo" min-width="250">
          <template #default="{ row }">
            <machine-steps :device="row" :now="nowSec"/>
            <el-button size="small" type="primary" class="nx-next" @click="onNext(row)">{{ nextStep(row, nowSec).label }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="200" fixed="right">
          <template #default="{ row }">
            <div class="nx-row-actions">
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
        <el-table-column label="Cliente" min-width="140">
          <template #default="{ row }">
            <el-tag v-if="groupName(row.group_id)" disable-transitions>{{ groupName(row.group_id) }}</el-tag>
            <el-tag v-else type="warning" disable-transitions>Sem cliente</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Próximo passo" min-width="250">
          <template #default="{ row }">
            <machine-steps :device="row" :now="nowSec"/>
            <el-button size="small" type="primary" class="nx-next" @click="onNext(row)">{{ nextStep(row, nowSec).label }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="Regra da senha" min-width="170">
          <template #default="{ row }">
            <button type="button" class="nx-rule" :class="'is-' + ruleBadge(ruleOf(row, policies)).tone"
                    :aria-label="'Alterar a regra da senha de ' + (row.alias || row.hostname || fmtId(row.peer_id)) + '. Hoje: ' + ruleBadge(ruleOf(row, policies)).title" @click="openRule(row)">
              <span class="nx-rule-title">{{ ruleBadge(ruleOf(row, policies)).title }}</span>
              <span class="nx-rule-detail">{{ ruleBadge(ruleOf(row, policies)).detail }}</span>
              <span class="nx-rule-edit">Alterar</span>
            </button>
          </template>
        </el-table-column>
        <el-table-column label="Situação" min-width="200">
          <template #default="{ row }">
            <!-- limpo: só o estado (e problemas). O resto aparece ao passar o mouse -->
            <el-tooltip placement="top-start" :show-after="250" popper-class="nx-status-tip">
              <template #content>
                <ul class="nx-status-lines"><li v-for="(line, i) in statusLines(row)" :key="i">{{ line }}</li></ul>
              </template>
              <div class="nx-status" tabindex="0">
                <span class="nx-dot" :class="statusDot(row)" aria-hidden="true"></span>
                <span :class="{ 'nx-warn-text': contact(row).state === 'parado', 'nx-muted': contact(row).state !== 'ativo' && contact(row).state !== 'parado' }">{{ contact(row).headline }}</span>
                <div v-if="agentError(row) && contact(row).state !== 'sem_agente'" class="nx-small nx-warn-text" role="alert">{{ agentError(row).text }}</div>
                <div v-if="row.force_rotate && row.enrolled" class="nx-small nx-warn-text">Troca em andamento</div>
                <!-- o mesmo texto da dica, para leitor de tela e para quem não usa o mouse -->
                <span class="nx-sr">{{ statusLines(row).join(' ') }}</span>
              </div>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="250" fixed="right">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-tooltip :content="secretActionState(row).revealReason" :disabled="secretActionState(row).canReveal" placement="top">
                <span class="nx-disabled-action"><el-button size="small" :disabled="!secretActionState(row).canReveal" @click="reveal(row)">Ver senha</el-button></span>
              </el-tooltip>
              <el-tooltip :content="secretActionState(row).rotateReason" :disabled="secretActionState(row).canRotate" placement="top">
                <span class="nx-disabled-action"><el-button size="small" :disabled="!secretActionState(row).canRotate" @click="rotate(row)">Trocar agora</el-button></span>
              </el-tooltip>
              <el-dropdown trigger="click" placement="bottom-end" @command="cmd => onRow(cmd, row)">
                <el-button size="small" aria-label="Mais ações"><el-icon><el-icon-MoreFilled/></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu class="nx-row-menu">
                    <el-dropdown-item command="rule">Regra da senha…</el-dropdown-item>
                    <el-dropdown-item v-if="row.enrolled" command="unenroll" divided>
                      <span class="nx-row-menu-item"><span class="nx-danger-text">Remover agente</span><small>{{ contact(row).state === 'parado' ? 'O agente está parado: remova e reinstale.' : 'Apaga o cadastro e as senhas guardadas.' }}</small></span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !filtered.length" :image-size="72"
                :description="devices.length ? 'Nenhuma máquina encontrada.' : 'Nenhuma máquina por aqui ainda.'">
        <p v-if="!devices.length">Instale o Nextec-Connect na máquina e aguarde 1 minuto. Ela aparece em Pendentes para você escolher o cliente.</p>
        <el-button v-if="!devices.length" type="primary" @click="openKey">Ver credencial de inscrição</el-button>
      </el-empty>
      <div v-if="filtered.length > pageSize" class="nx-pager">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" layout="total, prev, pager, next" :total="filtered.length" background/>
      </div>
    </div>

    <!-- escolher cliente -->
    <el-dialog v-model="pick.visible" class="nx-dlg" title="Escolher cliente" width="min(520px, 92vw)">
      <p class="nx-help nx-help-top">{{ pick.name }} ({{ fmtId(pick.peer) }}). Só depois do cliente o cofre gera e libera a senha desta máquina.</p>
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Cliente" required class="is-required">
          <el-select v-model="pick.client" filterable :filter-method="onClientFilter" placeholder="Busque o cliente" no-data-text="Nenhum cliente com esse nome." @visible-change="onClientOpen">
            <el-option v-for="g in clientOptions" :key="g.id" :label="g.name" :value="g.id"/>
          </el-select>
        </el-form-item>
        <div class="nx-create">
          <el-button v-if="!pick.creating" text type="primary" @click="startCreate">Criar cliente</el-button>
          <div v-else class="nx-create-row">
            <el-input v-model="pick.newName" placeholder="Nome do novo cliente" maxlength="60" aria-label="Nome do novo cliente" @keyup.enter="createClient"/>
            <el-button type="primary" :loading="pick.createBusy" @click="createClient">Criar e usar</el-button>
            <el-button @click="pick.creating = false">Cancelar</el-button>
          </div>
          <p v-if="pick.createError" class="nx-error" role="alert">{{ pick.createError }}</p>
        </div>
        <template v-if="pick.pending">
          <el-form-item label="Senha automática">
            <el-radio-group v-model="pick.rule" class="nx-radios">
              <el-radio v-if="groupRuleOn" value="group">Usar a regra do cliente</el-radio>
              <el-radio v-else value="group-enable">Senha automática do cliente (ligar agora)</el-radio>
              <el-radio value="peer">Regra só desta máquina</el-radio>
              <el-radio value="none">Não ligar agora</el-radio>
            </el-radio-group>
            <p v-if="pick.rule === 'group-enable' && pick.client" class="nx-help">
              Este cliente ainda não tem senha automática. Ao confirmar, ela é ligada para o cliente e a máquina é atribuída de uma vez.
            </p>
          </el-form-item>
          <el-form-item v-if="pick.rule === 'peer' || pick.rule === 'group-enable'" label="Trocar a cada">
            <el-select v-model="pick.interval"><el-option v-for="o in intervals" :key="o.value" :label="o.label" :value="o.value"/></el-select>
          </el-form-item>
          <el-form-item v-if="pickOtherClient">
            <el-checkbox v-model="pick.move">Esta máquina já está em "{{ groupName(pick.currentGroup) }}". Mover para o cliente escolhido.</el-checkbox>
          </el-form-item>
        </template>
      </el-form>
      <p class="nx-help">
        O técnico acessa pela lista "Cliente: nome do cliente", em
        <router-link to="/user/clientAccess" @click="pick.visible = false">Acesso por cliente</router-link>.
      </p>
      <p v-if="pick.error" class="nx-error" role="alert">{{ pick.error }}</p>
      <template #footer>
        <el-button @click="pick.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="pick.loading" :disabled="!canPick" @click="doPick">Confirmar e seguir</el-button>
      </template>
    </el-dialog>

    <!-- credencial de inscrição -->
    <el-dialog v-model="keyDlg.visible" class="nx-dlg" title="Credencial de inscrição" width="min(620px, 92vw)">
      <p class="nx-help nx-help-top">
        O gerador usa esta credencial automaticamente, a cada instalador novo: você não precisa copiá-la para lugar nenhum.
        Com ela, a máquina se inscreve como pendente e nada mais: não recebe senha nem acesso.
        Trate como segredo interno e gire se achar que vazou.
      </p>
      <p v-if="keyDlg.error" class="nx-error" role="alert">{{ keyDlg.error }}</p>
      <div class="nx-pw">
        <code>{{ keyDlg.loading ? 'carregando...' : (keyDlg.show ? keyDlg.key : maskedKey) || 'indisponível' }}</code>
        <el-button size="small" :disabled="!keyDlg.key" @click="keyDlg.show = !keyDlg.show">{{ keyDlg.show ? 'Ocultar' : 'Ver' }}</el-button>
        <el-button size="small" :disabled="!keyDlg.key" @click="copy(keyDlg.key)">Copiar</el-button>
      </div>
      <p class="nx-help">Versão {{ keyDlg.epoch || '-' }}. Girar invalida a credencial atual: instaladores já distribuídos deixam de inscrever máquinas novas, e o gerador passa a embutir a nova sozinho. As pendentes feitas com ela continuam na lista, marcadas como “Chave anterior”, e você ainda pode atribuí-las, rejeitá-las ou bloqueá-las. Máquinas já atribuídas não são afetadas.</p>
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

    <!-- regra de uma máquina -->
    <el-dialog v-model="ruleDlg.visible" class="nx-dlg" title="Regra da senha desta máquina" width="560px">
      <p class="nx-help nx-help-top"><strong>{{ ruleDlg.name }}</strong> ({{ fmtId(ruleDlg.peer) }}) · {{ ruleDlg.client ? 'cliente ' + ruleDlg.client : 'sem cliente' }}</p>
      <p class="nx-rule-now" role="status">Hoje vale: <strong>{{ ruleDlg.nowTitle }}</strong>, {{ ruleDlg.nowDetail }}.</p>
      <el-radio-group v-model="ruleDlg.choice" class="nx-radios nx-rule-choices">
        <el-radio value="client" :disabled="!ruleDlg.client">Seguir o cliente<small>{{ ruleDlg.followText }}</small></el-radio>
        <el-radio value="machine">Regra só desta máquina<small>Vale só aqui, e ganha da regra do cliente.</small></el-radio>
        <el-select v-if="ruleDlg.choice === 'machine'" v-model="ruleDlg.interval" class="nx-rule-interval" aria-label="Trocar a cada">
          <el-option v-for="o in intervals" :key="o.value" :label="'Trocar a cada ' + o.label" :value="o.value"/>
        </el-select>
        <el-radio value="off">Desligar nesta máquina<small>A senha não troca aqui, mesmo que o cliente tenha regra.</small></el-radio>
      </el-radio-group>
      <p class="nx-help">Mudar a regra do cliente muda todas as máquinas que seguem o cliente; máquinas com regra própria não mudam. <el-button link type="primary" @click="ruleDlg.visible = false; rules.visible = true">Ver as regras dos clientes</el-button></p>
      <template #footer>
        <el-button @click="ruleDlg.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="ruleDlg.saving" @click="saveRule">Salvar</el-button>
      </template>
    </el-dialog>

    <!-- regras por grupo -->
    <el-dialog v-model="rules.visible" class="nx-dlg" title="Regras de senha automática" width="720px">
      <p class="nx-help nx-help-top">Máquinas dos grupos ligados abaixo passam a trocar a senha sozinhas, no intervalo escolhido. Uma regra na própria máquina vale mais que a do grupo. A regra vale só para as máquinas que estão direto no grupo: um subgrupo (ex.: "Cliente / Servidores") não herda a do cliente e precisa da própria regra.</p>
      <el-table :data="groupPolicies" empty-text="Nenhum grupo ligado ainda." aria-label="Regras por grupo">
        <el-table-column label="Grupo" min-width="200">
          <template #default="{ row }">{{ groupName(Number(row.ref)) || 'grupo ' + row.ref }}</template>
        </el-table-column>
        <el-table-column label="Ligada" width="90">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" aria-label="Ligada" @change="savePolicy(row)"/>
          </template>
        </el-table-column>
        <el-table-column label="Máquinas" min-width="150">
          <template #default="{ row }">
            <span class="nx-small">{{ usageText(row) }}</span>
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

    <!-- instalar agente (autorização individual) -->
    <el-dialog v-model="agent.visible" class="nx-dlg" title="Instalar agente" width="min(620px, 92vw)">
      <ol class="nx-agent-steps">
        <li>Escolha a máquina e baixe o arquivo.</li>
        <li>Copie o arquivo para o servidor.</li>
        <li>Dê duplo clique como administrador. Leva alguns segundos.</li>
      </ol>
      <el-select v-model="agent.peer" filterable placeholder="Selecione a máquina" style="width:100%" :disabled="agent.loading" no-data-text="Nenhuma máquina encontrada.">
        <el-option v-for="o in agentChoices" :key="o.peer_id" :value="o.peer_id" :label="`${o.name} · ${fmtId(o.peer_id)}${o.badge ? ' · ' + o.badge : ''}`">
          <span>{{ o.name }} · {{ fmtId(o.peer_id) }}</span>
          <el-tag v-if="o.badge" size="small" :type="o.needsClient ? 'warning' : 'info'" disable-transitions class="nx-opt-tag">{{ o.badge }}</el-tag>
        </el-option>
      </el-select>
      <div v-if="!agentChoices.length" class="nx-empty-inline" role="status">
        <p class="nx-help">{{ AGENT_EMPTY_NOTICE }}</p>
        <el-button size="small" :loading="loading" @click="load()">Atualizar</el-button>
      </div>
      <el-alert v-if="agentNeedsClient" type="warning" :closable="false" show-icon :title="NEEDS_CLIENT_NOTICE" class="nx-agent-warn">
        <el-button size="small" type="primary" @click="chooseFromAgent">Escolher cliente agora</el-button>
      </el-alert>
      <el-alert v-if="!agentNeedsClient && agentChoice && agentChoice.agentActive" type="info" :closable="false" show-icon :title="agentChoice.notice" class="nx-agent-warn"/>
      <el-alert v-else-if="!agentNeedsClient && agentChoice && agentChoice.agentStalled" type="warning" :closable="false" show-icon class="nx-agent-warn"
                title="Este agente está cadastrado, mas parou de consultar o painel. Baixe o arquivo e execute no servidor para reinstalar: o agente novo substitui o parado e as senhas guardadas continuam."/>
      <div class="nx-agent-go">
        <el-button type="primary" :loading="agent.loading" :disabled="!agent.peer || agentNeedsClient || !(agentChoice && agentChoice.canAuthorize)" @click="downloadActivation">{{ agentChoice && agentChoice.agentStalled ? 'Baixar arquivo para reinstalar' : 'Baixar arquivo de ativação' }}</el-button>
      </div>
      <p class="nx-help">A autorização vale por 15 minutos e só para a máquina escolhida. O app gerado pelo painel (com o agente) precisa estar instalado no servidor. Não envie o arquivo por link público.</p>
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
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import { fmtId } from '@/nextec/id'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { secretActionState, assignPayload } from '@/nextec/secret-actions.mjs'
  import { normalizeOverview, normalizeGroups } from '@/nextec/secrets-data.mjs'
  import {
    machineStage, nextStep, overallSummary, firstNeeding, agentOptions, filterClients, newClientName, findClientByName,
    movePayload, defaultAssignRule, afterClientStep, friendlyError, NEEDS_CLIENT_NOTICE, AGENT_EMPTY_NOTICE,
  } from '@/nextec/secrets-flow.mjs'
  import { buildActivationCmd, activationFileName, downloadActivationCmd } from '@/nextec/activation-cmd.mjs'
  import { getAgentPackage } from '@/nextec/agent-package-sources.js'
  import { connectDevice } from '@/nextec/connect'
  import { list as adminPeers } from '@/api/peer'
  import { nextCheck, createAutoRefresh } from '@/nextec/agent-cycle.mjs'
  import { createRotationWatch, ROTATION_NOTICE } from '@/nextec/rotation-watch.mjs'
  import { agentContact, agentError, lastContactAt, REMOVE_AGENT_HELP } from '@/nextec/agent-state.mjs'
  import { ruleOf, ruleBadge, ruleChange, ruleChoice, followText, groupUsage } from '@/nextec/secret-rule.mjs'
  import { list as groupList, create as groupCreate } from '@/api/device_group'
  import { list as peerList, update as peerUpdate } from '@/api/peer'
  import MachineSteps from './MachineSteps.vue'
  import { timeAgo } from '@/utils/time'
  import {
    secretsOverview, secretsPolicy, secretsRotate, secretsReveal, secretsUnenroll, secretsBootstrap, secretsAudit,
    secretsAssign, secretsReject, secretsUnblock, enrollKeyGet, enrollKeyRotate,
  } from '@/nextec/api'
  import { activationBundle } from '@/nextec/local-requests.mjs'
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
  const loaded = ref(false)
  const blockedDlg = reactive({ visible: false })
  const tab = ref('machines')
  const viaText = { self: 'Inscrição global', bootstrap: 'Autorização individual', legacy: 'Chave do agente' }

  const intervals = [
    { value: 15, label: '15 minutos' }, { value: 60, label: '1 hora' }, { value: 180, label: '3 horas' },
    { value: 360, label: '6 horas' }, { value: 720, label: '12 horas' }, { value: 1440, label: '24 horas' },
  ]
  const every = (m) => (m % 60 === 0 ? (m / 60 === 1 ? 'hora' : `${m / 60} h`) : `${m} min`)

  let inflight = false
  const lastSeen = ref(new Map())
  // silent: atualização automática, sem spinner e sem trocar a lista por erro se uma rodada falhar.
  const load = async (silent = false) => {
    if (silent && inflight) return
    inflight = true
    if (!silent) loading.value = true
    const [ov, g, peers] = await Promise.all([
      secretsOverview().catch(() => false),
      groupList({ page: 1, page_size: 9999 }).catch(() => false),
      // última vez que o app de cada máquina falou com o servidor: separa "máquina offline" de "agente parado"
      adminPeers({ page: 1, page_size: 10000 }).catch(() => false),
    ])
    inflight = false
    if (!silent) loading.value = false
    if (!silent || ov) loadError.value = !ov
    if (ov) loaded.value = true
    if (ov) {
      const n = normalizeOverview(ov)
      // presença: só troca quando a lista de máquinas respondeu; se falhar, vale o último valor conhecido
      if (peers && peers.data && Array.isArray(peers.data.list)) lastSeen.value = new Map(peers.data.list.map(p => [String(p.id), Number(p.last_online_time) || 0]))
      devices.value = n.devices.map(d => (lastSeen.value.has(String(d.peer_id)) ? { ...d, peer_last_online: lastSeen.value.get(String(d.peer_id)) } : d))
      policies.value = n.policies
      agentKeySet.value = n.agentKeySet
      blocked.value = n.blocked
      pendingCount.value = n.pendingCount
      staleCount.value = n.staleCount
    }
    if (g) groups.value = normalizeGroups(g)
  }
  // Ciclo do agente (1 min): relógio da tela a cada 30 s e lista recarregada a cada 60 s, só com a aba visível.
  const nowSec = ref(Math.floor(Date.now() / 1000))
  const refresher = createAutoRefresh({
    onTick: () => { nowSec.value = Math.floor(Date.now() / 1000) },
    onRefresh: () => load(true),
  })
  // Depois de "Trocar agora" (ou de ligar a senha): recarrega a lista a cada 15 s, só com a aba visível, até a versão da
  // senha mudar (ou 3 min), para o estado aparecer sozinho. Um único timer para todas as máquinas.
  const rotationWatch = createRotationWatch({
    reload: () => load(true),
    versionOf: (peerId) => (devices.value.find(d => d.peer_id === peerId) || {}).version || 0,
    onSettled: (peerId) => {
      const row = devices.value.find(d => d.peer_id === peerId) || {}
      ElMessage.success(`Senha trocada: ${row.alias || row.hostname || peerId}.`)
    },
  })
  const nextCheckText = (row) => nextCheck(lastContactAt(row), nowSec.value).text
  // Situação do agente a partir da última consulta REAL (last_sync_at), nunca do cadastro.
  const contact = (row) => agentContact(row, nowSec.value)
  const statusDot = (row) => {
    const st = contact(row).state
    return st === 'ativo' ? 'is-on' : (st === 'parado' || st === 'pendente_aprovacao' ? 'is-warn' : 'is-off')
  }
  // detalhes que saem da lista e aparecem só ao passar o mouse em Situação
  const statusLines = (row) => {
    const c = contact(row)
    const out = []
    if (c.detail) out.push(c.detail)
    const next = nextCheckText(row)
    if (next) out.push(next)
    if (row.app_name) out.push('App ' + row.app_name)
    const err = agentError(row)
    if (err && c.state !== 'sem_agente') out.push(`${err.text} ${err.action || ''}`.trim())
    // regra pronta (a origem e o intervalo ficam na coluna Regra da senha)
    if (row.managed && c.state === 'ativo') out.push(`Senha troca a cada ${every(row.interval_minutes)}`)
    else if (row.managed && c.offline) out.push('Regra pronta; a troca volta quando a máquina ligar')
    else if (row.managed && c.state === 'parado') out.push('Regra pronta, mas o agente está parado')
    else if (row.managed) out.push('Regra pronta, falta o agente')
    else out.push('Senha automática desligada')
    if (row.has_password) {
      out.push(`Senha versão ${row.version}, trocada ${ago(row.active_at).toLowerCase()}${row.managed ? ', próxima ' + until(row.next_rotation_at) : ''}`)
    } else if (row.managed && c.state === 'ativo' && !err) out.push('Aguardando a primeira troca')
    if (row.force_rotate && row.enrolled) out.push('Troca solicitada: começa em até 1 minuto')
    if (!out.length) out.push('Sem mais detalhes.')
    return out
  }
  onMounted(() => { load(); refresher.start() })
  onBeforeUnmount(() => { refresher.stop(); rotationWatch.stop() })
  const reloadGroups = async () => {
    const g = await groupList({ page: 1, page_size: 9999 }).catch(() => false)
    if (g) groups.value = normalizeGroups(g)
  }

  // ---------- resumo e como funciona ----------
  const summary = computed(() => overallSummary(devices.value, nowSec.value))
  const HOW_KEY = 'nx-secrets-how-open'
  const readHow = () => { try { return localStorage.getItem(HOW_KEY) !== '0' } catch (e) { return true } }
  const howOpen = ref(readHow())
  const toggleHow = () => {
    howOpen.value = !howOpen.value
    try { localStorage.setItem(HOW_KEY, howOpen.value ? '1' : '0') } catch (e) { /* opcional */ }
  }
  const onCta = () => {
    const a = summary.value.cta && summary.value.cta.action
    if (a === 'show-key') return openKey()
    const stage = { 'choose-client': 'client', 'install-agent': 'agent', 'reinstall-agent': 'stalled', 'enable-rule': 'rule' }[a]
    const row = firstNeeding(devices.value, stage, nowSec.value)
    if (row) { if (stage === 'client' && row.state === 'pending') tab.value = 'pending'; onNext(row) }
  }
  const onMore = (cmd) => {
    if (cmd === 'rules') rules.visible = true
    else if (cmd === 'audit') openAudit()
    else if (cmd === 'key') openKey()
    else if (cmd === 'agent') openAgent()
    else if (cmd === 'add') openAdd()
  }
  // Um botão por máquina: o que ele faz depende só da etapa em que a máquina está.
  const onNext = async (row) => {
    const a = nextStep(row, nowSec.value).action
    if (a === 'choose-client') openChoose(row)
    else if (a === 'install-agent' || a === 'reinstall-agent') openAgent(row.peer_id)
    else if (a === 'enable-rule') await enableRule(row)
    else if (a === 'connect') await connectDevice(row.peer_id)
    else if (a === 'wait-machine') ElMessage.info('A máquina está desligada ou sem internet. O agente volta sozinho quando ela ligar; não precisa reinstalar.')
  }
  const enableRule = async (row) => {
    const r = await secretsPolicy({ kind: 'peer', ref: row.peer_id, enabled: true, interval_minutes: row.interval_minutes || 180 }).catch(() => false)
    if (r) {
      ElMessage.success('Senha automática ligada. A primeira troca começa em até 1 minuto.')
      rotationWatch.watch(row.peer_id, row.version || 0)
      load()
    }
  }

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
    if (r) {
      ElMessage.success(ROTATION_NOTICE)
      rotationWatch.watch(row.peer_id, row.version || 0)
      load(true)
    }
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
  // ---------- regra de uma máquina ----------
  const ruleDlg = reactive({ visible: false, peer: '', name: '', client: '', choice: 'client', interval: 180, nowTitle: '', nowDetail: '', followText: '', saving: false })
  const openRule = (row) => {
    const rule = ruleOf(row, policies.value)
    const badge = ruleBadge(rule)
    const client = groupName(row.group_id)
    Object.assign(ruleDlg, {
      visible: true, peer: row.peer_id, name: row.alias || row.hostname || fmtId(row.peer_id), client,
      choice: client || rule.source === 'machine' ? ruleChoice(rule) : 'machine',
      interval: rule.source === 'machine' && rule.interval ? rule.interval : (rule.clientRule && rule.clientRule.interval_minutes) || 180,
      nowTitle: badge.title, nowDetail: badge.detail, followText: followText(rule, client), saving: false,
    })
  }
  const saveRule = async () => {
    ruleDlg.saving = true
    const r = await secretsPolicy(ruleChange(ruleDlg.peer, ruleDlg.choice, ruleDlg.interval)).catch(() => false)
    ruleDlg.saving = false
    if (!r) return
    ElMessage.success(ruleDlg.choice === 'client' ? 'Agora esta máquina segue a regra do cliente.' : ruleDlg.choice === 'off' ? 'Senha automática desligada nesta máquina.' : 'Regra salva só para esta máquina.')
    ruleDlg.visible = false
    load()
  }
  const usageText = (p) => {
    const u = groupUsage(p, devices.value, policies.value)
    if (!u.total) return 'nenhuma máquina'
    return `${u.follow} ${u.follow === 1 ? 'segue' : 'seguem'}` + (u.own ? ` · ${u.own} com regra própria` : '')
  }
  const onRow = async (cmd, row) => {
    if (cmd === 'rule') return openRule(row)
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

  // ---------- escolher cliente (pendentes e máquinas sem cliente) ----------
  const pick = reactive({
    visible: false, loading: false, error: '', peer: '', name: '', pending: false, uuid: '', client: null, term: '',
    rule: 'none', interval: 180, move: false, currentGroup: 0, creating: false, newName: '', createError: '', createBusy: false,
  })
  const openChoose = (row) => {
    Object.assign(pick, {
      visible: true, loading: false, error: '', peer: row.peer_id, name: row.alias || row.hostname || 'Máquina',
      pending: row.state === 'pending', uuid: row.uuid || '', client: row.group_id || null, term: '', rule: 'none', interval: 180,
      move: false, currentGroup: row.group_id || 0, creating: false, newName: '', createError: '', createBusy: false,
    })
  }
  const clientOptions = computed(() => filterClients(groups.value, pick.term))
  const onClientFilter = (t) => { pick.term = t || '' }
  const onClientOpen = (open) => { if (open) pick.term = '' }
  const groupRuleOn = computed(() => policies.value.some(p => p.kind === 'group' && Number(p.ref) === pick.client && p.enabled))
  watch(() => pick.client, () => { if (pick.pending) pick.rule = defaultAssignRule(groupRuleOn.value) })
  const pickOtherClient = computed(() => !!pick.currentGroup && !!pick.client && pick.client !== pick.currentGroup)
  // 'group' só existe quando a regra do cliente está ligada; sem ela o padrão é 'group-enable' (liga e atribui junto).
  const canPick = computed(() => !!pick.client && !pick.loading &&
    (!pick.pending || (!(pick.rule === 'group' && !groupRuleOn.value) && (!pickOtherClient.value || pick.move))))
  const startCreate = () => { pick.creating = true; pick.createError = ''; pick.newName = pick.term || '' }
  const createClient = async () => {
    const v = newClientName(pick.newName, groups.value)
    if (!v.ok) {
      pick.createError = v.error
      if (v.existing) { pick.client = v.existing.id; pick.creating = false }
      return
    }
    pick.createBusy = true
    pick.createError = ''
    try {
      await groupCreate({ name: v.name, type: 1 })
      await reloadGroups()
      const g = findClientByName(groups.value, v.name)
      if (g) { pick.client = g.id; pick.creating = false; pick.newName = ''; ElMessage.success(`Cliente ${v.name} criado.`) }
      else pick.createError = 'O cliente foi criado, mas não apareceu na lista. Atualize a tela e escolha-o.'
    } catch (e) {
      pick.createError = friendlyError(e, 'Não foi possível criar o cliente. Tente de novo.')
    } finally { pick.createBusy = false }
  }
  // Pendente: rota de atribuição do cofre (aprovação, identidade e regra conferidas no servidor).
  // Máquina já aprovada sem cliente: mesma rota de "Mover para um cliente" em Dispositivos (POST /peer/update).
  const savePick = async () => {
    if (pick.pending) {
      return secretsAssign(assignPayload({ peer: pick.peer, client: pick.client, rule: pick.rule, interval: pick.interval, move: pick.move, uuid: pick.uuid }))
    }
    const r = await peerList({ page: 1, page_size: 20, id: pick.peer })
    const rows = r && r.data && Array.isArray(r.data.list) ? r.data.list : []
    const body = movePayload(rows.find(p => String(p.id) === String(pick.peer)), pick.client)
    if (!body) throw new Error('Não encontramos o cadastro desta máquina em Dispositivos. Atualize a lista e tente de novo.')
    return peerUpdate(body)
  }
  const doPick = async () => {
    pick.loading = true
    pick.error = ''
    try {
      const r = await savePick()
      pick.visible = false
      ElMessage.success(`${pick.name} agora é do cliente ${groupName(pick.client)}.`)
      if (r && r.data && r.data.group_rule_enabled) ElMessage.info('Senha automática ligada para o cliente.')
      if (r && r.data && r.data.already) ElMessage.info('Esta máquina já estava neste cliente.')
      await load()
      const fresh = devices.value.find(d => String(d.peer_id) === String(pick.peer))
      const next = fresh ? afterClientStep(fresh) : { action: 'stay' }
      if (next.action === 'install-agent') openAgent(pick.peer)
      else if (next.action === 'enable-rule') ElMessage.info('Próximo passo: ligar a senha automática desta máquina.')
    } catch (e) {
      pick.error = friendlyError(e, 'Não foi possível salvar o cliente. Atualize a lista e tente de novo.')
    } finally { pick.loading = false }
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
    add.options = r && r.data && Array.isArray(r.data.list) ? r.data.list : []
  }
  const saveAdd = async () => {
    const r = await secretsPolicy({ kind: 'peer', ref: add.peer, enabled: true, interval_minutes: add.interval }).catch(() => false)
    if (r) { add.visible = false; ElMessage.success('Senha automática ligada. Instale o agente na máquina, se ainda não instalou.'); load() }
  }

  // ---------- agente (autorização individual) ----------
  const agent = reactive({ visible: false, loading: false, peer: '', error: '' })
  const openAgent = (peer) => {
    Object.assign(agent, { visible: true, peer: typeof peer === 'string' ? peer : '', error: '' })
  }
  const agentChoices = computed(() => agentOptions(devices.value, nowSec.value))
  const agentChoice = computed(() => agentChoices.value.find(x => String(x.peer_id) === String(agent.peer)) || null)
  const agentNeedsClient = computed(() => {
    const o = agentChoices.value.find(x => String(x.peer_id) === String(agent.peer))
    return !!o && o.needsClient
  })
  const chooseFromAgent = () => {
    const row = devices.value.find(d => String(d.peer_id) === String(agent.peer))
    if (row) { agent.visible = false; openChoose(row) }
  }
  const downloadActivation = async () => {
    agent.loading = true
    agent.error = ''
    try {
      const id = String(agent.peer)
      const r = await secretsBootstrap(id)
      const bundle = activationBundle(r.data, id)
      const pkg = await getAgentPackage()
      downloadActivationCmd(buildActivationCmd(bundle, Date.now(), pkg), activationFileName(id))
      ElMessage.success('Arquivo baixado. Copie para o servidor e dê duplo clique como administrador, em até 15 minutos. Ele instala ou reinstala o agente sozinho; o estado vira Ativo quando o agente consultar o painel.')
    } catch (e) { agent.error = friendlyError(e, 'Não foi possível autorizar esta máquina. Atualize a lista e tente de novo.') }
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
    agent_replaced_stale: 'Agente parado substituído (reinstalação)',
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
    audit.list = r && r.data && Array.isArray(r.data.list) ? r.data.list : []
  }
</script>

<style scoped lang="scss">
  .nx-bar {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 16px 18px; margin-bottom: 12px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
  }
  .nx-search { flex: 1 1 260px; max-width: 360px; }
  .nx-hero {
    display: flex; flex-wrap: wrap; gap: 14px 20px; align-items: center; justify-content: space-between; padding: 18px 20px; margin-bottom: 12px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); border-left: 5px solid #613CB3;
  }
  .nx-hero-title { margin: 0; font-family: var(--nx-font-title); font-size: 18px; font-weight: 700; color: var(--nx-text); }
  .nx-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
  .nx-chip { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--nx-field); color: var(--nx-text-muted);
    &.is-warn { background: #FEF3C7; color: #7A4500; }
    &.is-ok { background: #D1FAE5; color: #065F46; } }
  .nx-how { margin-bottom: 12px; padding: 4px 18px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); }
  .nx-how-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 10px 0; border: 0; background: none; cursor: pointer;
    font: inherit; font-weight: 700; color: var(--nx-text); }
  .nx-how-toggle:focus-visible { outline: 2px solid var(--nx-focus); outline-offset: 2px; border-radius: 6px; }
  .nx-how-list { margin: 0 0 12px; padding-left: 20px; display: grid; gap: 6px; font-size: 14px; color: var(--nx-text-muted); }
  .nx-next { margin-top: 8px; }
  .nx-create { margin: -6px 0 12px; }
  .nx-create-row { display: flex; gap: 8px; flex-wrap: wrap; .el-input { flex: 1 1 200px; } .el-button { margin: 0; } }
  .nx-agent-steps { margin: 0 0 14px; padding-left: 20px; font-size: 14px; display: grid; gap: 4px; color: var(--nx-text); }
  .nx-agent-warn { margin-top: 12px; }
  .nx-agent-go { margin-top: 14px; }
  .nx-opt-tag { margin-left: 8px; }
  .nx-empty-inline { margin-top: 8px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .nx-empty-inline .nx-help { margin: 0; }
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
  .nx-row-actions { display: flex; gap: 6px; flex-wrap: nowrap; justify-content: flex-end; .el-button { margin: 0 !important; } }
  .nx-status { cursor: default; outline-offset: 2px; }
  .nx-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .nx-rule { display: grid; gap: 1px; text-align: left; padding: 6px 10px; border: 1px solid var(--nx-border); border-radius: 10px; background: var(--nx-surface); color: var(--nx-text); font: inherit; cursor: pointer; min-height: 44px; max-width: 100%;
    &:hover { background: var(--nx-field); }
    &:focus-visible { outline: 2px solid var(--nx-accent); outline-offset: 2px; }
    .nx-rule-title { font-weight: 600; font-size: 13px; }
    .nx-rule-detail { font-size: 12px; color: var(--nx-text-muted); }
    .nx-rule-edit { font-size: 12px; color: var(--nx-accent); font-weight: 600; }
    &.is-client { border-left: 4px solid #613CB3; }
    &.is-machine { border-left: 4px solid #B26A00; }
    &.is-off { border-left: 4px solid #9A97AD; }
    &.is-none { border-style: dashed; }
  }
  .nx-rule-now { margin: 0 0 10px; padding: 8px 12px; border-radius: 10px; background: var(--nx-bg); font-size: 13px; }
  .nx-rule-choices { gap: 6px; width: 100%; .el-radio { height: auto; align-items: flex-start; white-space: normal; margin-right: 0; } small { display: block; font-size: 12px; color: var(--nx-text-muted); font-weight: 400; } }
  .nx-rule-interval { width: 100%; max-width: 260px; margin: 0 0 4px 24px; }
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
  html.dark .nx-chip.is-warn { background: #3A2E10; color: #FCD38A; }
  html.dark .nx-chip.is-ok { background: #0F3A2B; color: #6EE7B7; }
  html.dark .nx-hero { border-left-color: #B79CFF; }
  html.dark .nx-error, html.dark .nx-danger-text { color: #FFB4AB; }
</style>
<style lang="scss">
  // dicas e menus abrem fora do componente, por isso o estilo não é escopado
  .nx-status-tip { max-width: 360px; }
  .nx-status-lines { margin: 0; padding-left: 16px; font-size: 12px; line-height: 1.5; }
  .nx-row-menu .el-dropdown-menu__item { align-items: flex-start; }
  .nx-row-menu-item { display: flex; flex-direction: column; gap: 1px; white-space: normal; max-width: 240px; }
  .nx-row-menu-item small { font-size: 12px; color: var(--nx-text-muted); }
</style>
