/** 一个编辑画布共享一个图片池；引用的尺寸与裁剪由使用方控制。 */
export class SvgAssetLibrary {
  private sources = new Map<string, string>();
  private markup = '';
  private serial = 0;
  constructor(private readonly prefix = 'editor-image') {}
  reference(source: string): string {
    let id = this.sources.get(source);
    if (!id) {
      id = `${this.prefix}-${++this.serial}`;
      this.sources.set(source, id);
      // 使用单位图片，尚未完成 alpha 测量时也不必重新创建根定义。
      this.markup += `<image id="${id}" href="${source}" width="1" height="1" preserveAspectRatio="none"/>`;
    }
    return id;
  }
  image(source: string, x: number, y: number, width: number, height: number): string {
    return `<use href="#${this.reference(source)}" transform="translate(${x} ${y}) scale(${width} ${height})"/>`;
  }
  get definitions(): string { return this.markup; }
  get count(): number { return this.sources.size; }
}
