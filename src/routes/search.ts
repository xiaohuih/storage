import { FastifyInstance, RequestGenericInterface } from 'fastify'
import { PostgrestClient } from '@supabase/postgrest-js'
import { getConfig } from '../utils/config'
interface requestGeneric extends RequestGenericInterface {
  Params: {
    bucketName: string
  }
  Body: {
    prefix: string
    limit: number
    offset: number
  }
}

const { projectRef, supabaseDomain, anonKey } = getConfig()

function getPostgrestClient(jwt: string) {
  // @todo in kps, can we just ping localhost?
  const url = `https://${projectRef}.${supabaseDomain}/rest/v1`
  const postgrest = new PostgrestClient(url, {
    headers: {
      apiKey: anonKey,
      Authorization: `Bearer ${jwt}`,
    },
  })
  return postgrest
}

export default async function routes(fastify: FastifyInstance) {
  fastify.post<requestGeneric>('/search/:bucketName', async (request, response) => {
    const authHeader = request.headers.authorization
    if (!authHeader) {
      return response.status(403).send('Go away')
    }
    const jwt = authHeader.substring('Bearer '.length)

    const postgrest = getPostgrestClient(jwt)
    const { bucketName } = request.params
    const { limit, offset } = request.body
    let { prefix } = request.body
    if (prefix.length > 0 && !prefix.endsWith('/')) {
      // assuming prefix is always a folder
      prefix = `${prefix}/`
    }
    console.log(request.body)
    console.log(`searching for `, prefix)
    const { data: results, error } = await postgrest.rpc('search', {
      prefix,
      bucketname: bucketName,
      limits: limit,
      offsets: offset,
      levels: prefix.split('/').length,
    })
    console.log(results, error)

    response.status(200).send(results)
  })
}
