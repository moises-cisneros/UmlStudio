export class RasterTooLargeError extends Error {
  constructor(
    message: string,
    readonly canvasWidth: number,
    readonly canvasHeight: number
  ) {
    super(message)
    this.name = "RasterTooLargeError"
  }
}
