declare module 'jscanify/client' {
  export default class jscanify {
    constructor()
    findPaperContour(img: unknown): unknown
    getCornerPoints(contour: unknown): {
      topLeftCorner?: { x: number; y: number }
      topRightCorner?: { x: number; y: number }
      bottomLeftCorner?: { x: number; y: number }
      bottomRightCorner?: { x: number; y: number }
    }
    highlightPaper(image: unknown, options?: unknown): HTMLCanvasElement
    extractPaper(
      image: unknown,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: unknown,
    ): HTMLCanvasElement
  }
}
