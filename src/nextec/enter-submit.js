// Enter envia o diálogo: em campos de texto dentro de um el-dialog, Enter aciona o botão principal.
// Fica de fora: textarea (Enter quebra linha), seletores (Enter escolhe a opção), caixas e botões.
export function enterToSubmit () {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
    const t = e.target
    if (!(t instanceof HTMLInputElement)) return
    if (['checkbox', 'radio', 'button', 'submit', 'file'].includes(t.type)) return
    if (t.closest('.el-select, .el-autocomplete, .el-cascader, .el-date-editor, .el-input-number, .el-transfer')) return
    const dialog = t.closest('.el-dialog')
    if (!dialog) return
    const buttons = [...dialog.querySelectorAll('.el-button--primary')]
      .filter(b => b.offsetParent && !b.disabled && !b.classList.contains('is-loading') && !b.classList.contains('is-disabled'))
    const target = buttons[buttons.length - 1]
    if (!target) return
    e.preventDefault()
    target.click()
  })
}
