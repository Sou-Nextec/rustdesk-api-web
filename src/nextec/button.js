// Ajusta o tipo de alguns botões do upstream sem editar as telas:
// - "Adicionar" vem como perigo (vermelho); vira a ação principal da tela.
// - "Filtrar" deixa de ser primário, para haver um só botão de destaque por barra.
// - "Alterar senha" (Meus dados) vem como perigo; vira botão comum.
// - "Sair" em Sessões ativas encerra a sessão de outra pessoa; o texto passa a dizer isso.
import { h } from 'vue'
import { useRoute } from 'vue-router'
import { ElButton } from 'element-plus'
import { T } from '@/utils/i18n'

function slotText (slots) {
  const nodes = slots.default ? slots.default() : []
  return nodes.map(n => (typeof n.children === 'string' ? n.children : '')).join('').trim()
}

// botões que o upstream pinta de primário ou de perigo sem serem a ação principal nem destrutivos
// (chaves de tradução; T() só é chamado na renderização, quando o idioma já está carregado)
const NEUTRAL_KEYS = {
  primary: ['Filter', 'BatchAddToAB', 'AddToAddressBook'],
  danger: ['ChangePassword', 'Import'],
}
const isNeutral = (type, text) => (NEUTRAL_KEYS[type] || []).some(k => T(k) === text)

const NextecButton = {
  name: 'ElButton',
  inheritAttrs: false,
  setup (_, { attrs, slots }) {
    const route = useRoute()
    return () => {
      const props = { ...attrs }
      const text = slotText(slots)
      let children = slots

      if (text === T('Add') && props.type === 'danger') props.type = 'primary'
      else if (text === T('Submit') && props.type === 'success') props.type = 'primary' // cadastro
      else if (isNeutral(props.type, text)) props.type = ''
      else if (text === T('Logout') && route?.name === 'UserToken') {
        children = { ...slots, default: () => T('NxEndSession') }
      }
      return h(ElButton, props, children)
    }
  },
}

export default {
  install (app) {
    delete app._context.components.ElButton // evita o aviso de componente já registrado
    app.component('ElButton', NextecButton)
  },
}
