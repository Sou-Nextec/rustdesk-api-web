import test from 'node:test'
import assert from 'node:assert/strict'
import { activationBundle, signingRequest } from '../../src/nextec/local-requests.mjs'

test('activation binds the real ID and strips response-only fields', () => {
 const result=activationBundle({painel:'https://painel-remoto.nex.tec.br',id:'536822159',uuid:'uuid',bootstrap:'a'.repeat(43),expires_in:900},'536822159')
 assert.deepEqual(Object.keys(result),['painel','id','uuid','bootstrap'])
 assert.throws(()=>activationBundle({...result,id:'1223489525'},'536822159'))
 assert.throws(()=>activationBundle({...result,painel:'https://example.com'},'536822159'))
})
test('signing request has no credentials and binds each canonical asset', () => {
 const request={produto:'nextec-connect',formato:1,versao:'2.0.9',sequencia:17,windows:{arquivo:'files/nextec-acesso-2.0.9.msi',sha256:'a'.repeat(64),tamanho:123}}
 assert.deepEqual(signingRequest(request),request)
 assert.throws(()=>signingRequest({...request,token:'secret'}))
 assert.throws(()=>signingRequest({...request,windows:{...request.windows,arquivo:'https://example.com/app.msi'}}))
 assert.throws(()=>signingRequest({...request,sequencia:0}))
 assert.throws(()=>signingRequest({...request,sequencia:Number.MAX_SAFE_INTEGER+1}))
})
test('Linux-only requests preserve arch, version and hash', () => {
 const request={produto:'nextec-connect',formato:1,versao:'2.0.9',sequencia:18,linux:{amd64:{arquivo:'files/nextec-acesso-2.0.9-amd64.deb',sha256:'b'.repeat(64),tamanho:99}}}
 assert.deepEqual(signingRequest(request),request)
 assert.throws(()=>signingRequest({...request,linux:{...request.linux,unknown:{}}}))
})
