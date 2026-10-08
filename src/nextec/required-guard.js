// Vários formulários do upstream marcam campos como obrigatórios (asterisco), mas o botão Enviar
// não chama a validação, e o servidor aceita o cadastro vazio. Em vez de editar cada tela,
// interceptamos o clique no botão principal do formulário: se houver campo obrigatório vazio,
// o envio é bloqueado, os campos ficam destacados e o foco vai para o primeiro deles.
import { ElMessage } from 'element-plus'

function isEmpty (item) {
  const select = item.querySelector('.el-select')
  if (select) {
    // seleção vazia: o Element Plus mostra o placeholder e nenhuma tag
    const placeholder = select.querySelector('.el-select__placeholder')
    const hasTags = select.querySelector('.el-tag')
    return !hasTags && (!placeholder || placeholder.classList.contains('is-transparent'))
  }
  const field = item.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea')
  if (field) return field.value.trim() === ''
  return false // switch, radio, upload: não dá para afirmar que está vazio
}

function markItem (item, empty) {
  item.classList.toggle('nx-required-empty', empty)
}

function onClick (event) {
  const button = event.target.closest('.el-button--primary')
  if (!button) return
  const form = button.closest('.el-dialog .el-form, .form-card .el-form')
  if (!form || form.classList.contains('el-form--inline')) return
  // só o botão da última linha (Enviar/Confirmar), não botões auxiliares dentro dos campos
  const lastItem = [...form.querySelectorAll(':scope > .el-form-item')].pop()
  if (!lastItem || !lastItem.contains(button)) return

  const required = [...form.querySelectorAll('.el-form-item.is-required')]
  const empty = required.filter(isEmpty)
  required.forEach(item => markItem(item, empty.includes(item)))
  if (!empty.length) return

  event.preventDefault()
  event.stopImmediatePropagation()
  ElMessage.warning('Preencha os campos obrigatórios marcados com *.')
  const first = empty[0].querySelector('input, textarea')
  first?.focus()
}

function onInput (event) {
  const item = event.target.closest?.('.el-form-item.nx-required-empty')
  if (item && !isEmpty(item)) markItem(item, false)
}

export function guardRequiredFields () {
  document.addEventListener('click', onClick, true)
  document.addEventListener('input', onInput, true)
  document.addEventListener('change', onInput, true)
}
