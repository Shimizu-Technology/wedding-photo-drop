declare module '@rails/activestorage' {
  export type DirectUploadBlob = {
    id: number
    key: string
    filename: string
    content_type: string
    byte_size: number
    checksum: string
    signed_id: string
    attachable_sgid: string
  }

  export type DirectUploadCallback = (error: string | null, blob?: DirectUploadBlob) => void

  export class DirectUpload {
    constructor(file: File, url: string, delegate?: unknown, customHeaders?: Record<string, string>)
    create(callback: DirectUploadCallback): void
  }
}
