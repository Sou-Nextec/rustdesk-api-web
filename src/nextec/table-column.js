// As telas do upstream fixam a coluna "Ações" com 400 a 650px, o que espreme as outras colunas
// (e os textos em pt-BR são mais longos que em inglês). Em vez de editar cada tela, registramos
// um ElTableColumn que troca essa largura fixa por uma largura mínima menor e deixa os botões
// quebrarem em linhas dentro da célula.
import { h } from 'vue'
import { ElTableColumn } from 'element-plus'
import { T } from '@/utils/i18n'

const MAX_ACTIONS_WIDTH = 300

const NextecTableColumn = {
  name: 'ElTableColumn',
  inheritAttrs: false,
  setup (_, { attrs, slots }) {
    return () => {
      const props = { ...attrs }
      const width = Number(props.width)
      if (props.label === T('Actions') && width > MAX_ACTIONS_WIDTH) {
        delete props.width
        props['min-width'] = MAX_ACTIONS_WIDTH
        props['class-name'] = [props['class-name'], 'nx-actions'].filter(Boolean).join(' ')
      }
      return h(ElTableColumn, props, slots)
    }
  },
}

export default {
  install (app) {
    delete app._context.components.ElTableColumn // evita o aviso de componente já registrado
    app.component('ElTableColumn', NextecTableColumn)
  },
}
