const reject = () => { throw new Error('O pedido recebido não corresponde à máquina ou ao pacote escolhido.') }
const exactKeys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key))

export function activationBundle(value, expectedId) {
 if (!value || value.painel !== 'https://painel-remoto.nex.tec.br' || value.id !== expectedId || !/^\d{6,64}$/.test(value.id) ||
     typeof value.uuid !== 'string' || !value.uuid.trim() || value.uuid.length > 128 || !/^[A-Za-z0-9_-]{43}$/.test(value.bootstrap)) reject()
 return {painel:value.painel,id:value.id,uuid:value.uuid,bootstrap:value.bootstrap}
}

export function signingRequest(value) {
 if (!exactKeys(value,['produto','formato','versao','sequencia','windows','linux']) || value.produto !== 'nextec-connect' || value.formato !== 1 ||
     !/^\d{1,4}\.\d{1,4}\.\d{1,4}(\.\d{1,4})?$/.test(value.versao) || !Number.isSafeInteger(value.sequencia) || value.sequencia < 1) reject()
 const asset = (item, suffix) => {
  if (!exactKeys(item,['arquivo','sha256','tamanho']) || item.arquivo !== `files/nextec-acesso-${value.versao}${suffix}` ||
      !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.tamanho) || item.tamanho < 8 || item.tamanho > 314572800) reject()
  return {arquivo:item.arquivo,sha256:item.sha256,tamanho:item.tamanho}
 }
 const request={produto:'nextec-connect',formato:1,versao:value.versao,sequencia:value.sequencia}
 if (value.windows) request.windows=asset(value.windows,'.msi')
 if (value.linux) {
  if (!exactKeys(value.linux,['amd64','arm64']) || !Object.keys(value.linux).length) reject()
  request.linux={}
  for (const arch of Object.keys(value.linux)) request.linux[arch]=asset(value.linux[arch],`-${arch}.deb`)
 }
 if (!request.windows && !request.linux) reject()
 return request
}

export function downloadLocalJson(name, value) {
 const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}))
 const link=document.createElement('a')
 link.href=url; link.download=name; link.click()
 setTimeout(()=>URL.revokeObjectURL(url),1000)
}
