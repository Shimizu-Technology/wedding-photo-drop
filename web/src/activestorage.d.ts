declare module '@rails/activestorage' {
  export class DirectUpload {
    constructor(file: File, url: string, delegate?: unknown)
    create(callback: (error: string | null, blob: unknown) => void): void
  }
}
