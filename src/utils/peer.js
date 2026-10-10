// Nextec: o protocolo do link vem do painel (rustdesk ou o nome do app gerado, ex.: nextec-connect). Ver src/nextec/connect.js.
import { connectLink } from '@/nextec/connect'

export const connectByClient = (id) => {
  connectLink(id)
}
