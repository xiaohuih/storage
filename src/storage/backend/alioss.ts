import {
  StorageBackendAdapter,
  BrowserCacheHeaders,
  ObjectMetadata,
  ObjectResponse,
  UploadPart,
  withOptionalVersion,
} from './adapter'
import { ERRORS, StorageBackendError } from '../errors'
import { Readable } from 'stream'
import OSS from 'ali-oss'
import { getConfig } from '../../config'

const { storageAliossBucket } = getConfig()

export interface AliossClientOptions {
  accessKeyId: string
  accessKeySecret: string
  endpoint?: string
  region?: string
  bucket?: string
}

/**
 * AliossBackend
 * Interacts with an s3-compatible file system with this S3Adapter
 */
export class AliossBackend implements StorageBackendAdapter {
  client: OSS

  constructor(options: AliossClientOptions) {
    this.client = new OSS({
      accessKeyId: options.accessKeyId,
      accessKeySecret: options.accessKeySecret,
      endpoint: options.endpoint,
      region: options.region,
      bucket: options.bucket,
    })
  }

  /**
   * Gets an object body and metadata
   * @param bucketName
   * @param key
   * @param version
   * @param headers
   */
  async getObject(
    bucketName: string,
    key: string,
    version: string | undefined,
    headers?: BrowserCacheHeaders
  ): Promise<ObjectResponse> {
    const data = await this.client.get(withOptionalVersion(`${bucketName}/${key}`, version), {
      headers: {
        Range: headers?.range,
        IfModifiedSince: headers?.ifModifiedSince,
        IfNoneMatch: headers?.ifNoneMatch,
      }
    })
    const resHeaders = data.res.headers as any

    return {
      metadata: {
        cacheControl: 'no-cache',
        mimetype: resHeaders["Content-Type"] || 'application/octa-stream',
        eTag: resHeaders["ETag"] || '',
        lastModified: resHeaders["Last-Modified"],
        contentRange: resHeaders["Content-Range"],
        contentLength: resHeaders["Content-Length"] || 0,
        httpStatusCode: data.res.status || 200,
        size: data.res.size || 0,
      },
      body: data.content,
    }
  }

  /**
   * Uploads and store an object
   * @param bucketName
   * @param key
   * @param version
   * @param body
   * @param contentType
   * @param cacheControl
   */
  async uploadObject(
    bucketName: string,
    key: string,
    version: string | undefined,
    body: NodeJS.ReadableStream,
    contentType: string,
    cacheControl: string
  ): Promise<ObjectMetadata> {
    try {
      const data = await this.client.put(withOptionalVersion(`${bucketName}/${key}`, version), body, {
        headers: {
          'Cache-Control': cacheControl,
          'Content-Type': contentType,
      }})

      const metadata = await this.headObject(bucketName, key, version)

      return {
        httpStatusCode: data.res.status || metadata.httpStatusCode,
        cacheControl: cacheControl,
        eTag: metadata.eTag,
        mimetype: metadata.mimetype,
        contentLength: metadata.contentLength,
        lastModified: metadata.lastModified,
        size: metadata.size,
        contentRange: metadata.contentRange,
      }
    } catch (err: any) {
      throw StorageBackendError.fromError(err)
    }
  }

  /**
   * Deletes an object
   * @param bucket
   * @param key
   * @param version
   */
  async deleteObject(bucket: string, key: string, version: string | undefined): Promise<void> {
    await this.client.delete(withOptionalVersion(`${bucket}/${key}`, version))
  }

  /**
   * Copies an existing object to the given location
   * @param bucket
   * @param source
   * @param version
   * @param destination
   * @param destinationVersion
   * @param conditions
   */
  async copyObject(
    bucket: string,
    source: string,
    version: string | undefined,
    destination: string,
    destinationVersion: string | undefined,
    conditions?: {
      ifMatch?: string
      ifNoneMatch?: string
      ifModifiedSince?: Date
      ifUnmodifiedSince?: Date
    }
  ): Promise<Pick<ObjectMetadata, 'httpStatusCode' | 'eTag' | 'lastModified'>> {
    try {
      const data = await this.client.copy(withOptionalVersion(`${bucket}/${destination}`, destinationVersion),
        withOptionalVersion(`${bucket}/${source}`, version), {
          headers: {
            'x-oss-copy-source-if-match': conditions?.ifMatch || "",
            'x-oss-copy-source-if-none-match': conditions?.ifNoneMatch || "",
            'x-oss-copy-source-if-modified-since': conditions?.ifModifiedSince?.toUTCString() || "",
            'x-oss-copy-source-if-unmodified-since': conditions?.ifUnmodifiedSince?.toUTCString() || "",
          }
        })
      return {
        httpStatusCode: data.res.status || 200,
        eTag: data.data.etag || '',
        lastModified: new Date(data.data.lastModified),
      }
    } catch (e: any) {
      throw StorageBackendError.fromError(e)
    }
  }

  /**
   * Deletes multiple objects
   * @param bucket
   * @param prefixes
   */
  async deleteObjects(bucket: string, prefixes: string[]): Promise<void> {
    const aliossPrefixes = prefixes.map((ele) => {
      return `${bucket}/${ele}`
    })
    try {
      await this.client.deleteMulti(aliossPrefixes)
    } catch (e) {
      throw StorageBackendError.fromError(e)
    }
  }

  /**
   * Returns metadata information of a specific object
   * @param bucket
   * @param key
   * @param version
   */
  async headObject(
    bucket: string,
    key: string,
    version: string | undefined
  ): Promise<ObjectMetadata> {
    try {
      const data = await this.client.head(
        withOptionalVersion(`${bucket}/${key}`, version)
      )
      const resHeaders = data.res.headers as any
      return {
        cacheControl: 'no-cache',
        mimetype: resHeaders["Content-Type"] || 'application/octa-stream',
        eTag: resHeaders["ETag"] || '',
        lastModified: resHeaders["Last-Modified"],
        contentRange: resHeaders["Content-Range"],
        contentLength: resHeaders["Content-Length"] || 0,
        httpStatusCode: data.res.status || 200,
        size: data.res.size || 0
      }
    } catch (e: any) {
      throw StorageBackendError.fromError(e)
    }
  }

  /**
   * Returns a private url that can only be accessed internally by the system
   * @param bucket
   * @param key
   * @param version
   */
  async privateAssetUrl(bucket: string, key: string, version: string | undefined): Promise<string> {
    return this.client.asyncSignatureUrl(withOptionalVersion(`${bucket}/${key}`, version))
  }

  async createMultiPartUpload(
    bucketName: string,
    key: string,
    version: string | undefined,
    contentType: string,
    cacheControl: string
  ) {
    const resp = await this.client.initMultipartUpload(
      withOptionalVersion(`${bucketName}/${key}`, version), {
        mime: contentType,
        headers: {
          'Cache-Control': cacheControl
        }
      })

    if (!resp.uploadId) {
      throw ERRORS.InvalidUploadId()
    }

    return resp.uploadId
  }

  async uploadPart(
    bucketName: string,
    key: string,
    version: string,
    uploadId: string,
    partNumber: number,
    body?: string | Uint8Array | Buffer | Readable,
    length?: number
  ) {
    const resp = await this.client.uploadPart(
      withOptionalVersion(`${bucketName}/${key}`, version),
      uploadId,
      partNumber,
      body,
      0,
      length??0
    )

    return {
      version,
      ETag: resp.etag,
    }
  }

  async completeMultipartUpload(
    bucketName: string,
    key: string,
    uploadId: string,
    version: string,
    parts: UploadPart[]
  ) {
    const keyParts = key.split('/')

    if (parts.length === 0) {
      const partsResponse = await this.client.listParts(withOptionalVersion(`${bucketName}/${key}`, version), uploadId)
      parts = partsResponse.parts || []
    }

    const response = await this.client.completeMultipartUpload(
      withOptionalVersion(`${bucketName}/${key}`, version),
      uploadId,
      parts.map(({ ETag, PartNumber }) => ({
        etag: ETag || "",
        number: PartNumber || 0,
      }))
    )

    const locationParts = key.split('/')
    locationParts.shift() // tenant-id
    const bucket = keyParts.shift()

    response.bucket
    return {
      version,
      location: keyParts.join('/'),
      ...response,
      bucket,
    }
  }

  async abortMultipartUpload(bucketName: string, key: string, uploadId: string): Promise<void> {
    await this.client.abortMultipartUpload(`${bucketName}/${key}`, uploadId)
  }

  async uploadPartCopy(
    bucketName: string,
    key: string,
    version: string,
    UploadId: string,
    PartNumber: number,
    sourceKey: string,
    sourceKeyVersion?: string,
    bytesRange?: { fromByte: number; toByte: number }
  ) {
    const data = await this.client.uploadPartCopy(
      withOptionalVersion(`${bucketName}/${key}`, version),
      UploadId,
      PartNumber,
      bytesRange ? `bytes=${bytesRange.fromByte}-${bytesRange.toByte}` : "",
      {sourceKey: withOptionalVersion(`${bucketName}/${sourceKey}`, sourceKeyVersion), sourceBucketName:storageAliossBucket||""},
      {}
    )

    const resHeaders = data.res.headers as any
    return {
      eTag: data.etag,
      lastModified: resHeaders["Last-Modified"],
    }
  }
}
