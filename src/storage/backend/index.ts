import { StorageBackendAdapter } from './adapter'
import { FileBackend } from './file'
import { S3Backend, S3ClientOptions } from './s3'
import { getConfig, StorageBackendType } from '../../config'
import { AliossBackend } from './alioss'

export * from './s3'
export * from './file'
export * from './adapter'

const { 
  storageS3Region, storageS3Endpoint, storageS3ForcePathStyle,
  storageAliossAccessKeyId, storageAliossAccessKeySecret, storageAliossEndpoint, storageAliossRegion, storageAliossBucket
} = getConfig()

type ConfigForStorage<Type extends StorageBackendType> = Type extends 's3'
  ? S3ClientOptions
  : undefined

export function createStorageBackend<Type extends StorageBackendType>(
  type: Type,
  config?: ConfigForStorage<Type>
) {
  let storageBackend: StorageBackendAdapter

  if (type === 'file') {
    storageBackend = new FileBackend()
  } else if(type === 'alioss') {
    storageBackend = new AliossBackend({
      accessKeyId: storageAliossAccessKeyId!,
      accessKeySecret: storageAliossAccessKeySecret!,
      endpoint: storageAliossEndpoint,
      region: storageAliossRegion,
      bucket: storageAliossBucket
    })
  } else {
    const defaultOptions: S3ClientOptions = {
      region: storageS3Region,
      endpoint: storageS3Endpoint,
      forcePathStyle: storageS3ForcePathStyle,
      ...(config ? config : {}),
    }
    storageBackend = new S3Backend(defaultOptions)
  }

  return storageBackend
}
