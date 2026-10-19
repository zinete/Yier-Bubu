import type { CustomMap } from './CustomMap';

/** 仅供进程内使用；文件/草稿仍由 CustomMap 保存内嵌 PNG，不输出池引用。 */
export class EditorDocument {
  private payloads = new Map<string, string>();
  private tokens = new Map<string, string>();
  private serial = 0;
  capture(map: CustomMap): string {
    const assets = map.assets?.map((asset) => {
      let token = this.tokens.get(asset.data);
      if (!token) {
        token = `editor-image-${++this.serial}`;
        this.payloads.set(token, asset.data); this.tokens.set(asset.data, token);
      }
      return { ...asset, data: token };
    });
    return JSON.stringify({ ...map, ...(assets ? { assets } : {}) });
  }
  restore(snapshot: string): CustomMap {
    const map = JSON.parse(snapshot) as CustomMap;
    for (const asset of map.assets ?? []) {
      const data = this.payloads.get(asset.data);
      if (data === undefined) throw new Error('编辑历史缺少图片数据；已停止恢复，当前地图保持不变');
      asset.data = data;
    }
    return map;
  }
  /** 复制可编辑模型，图片字符串直接共享，不参与 structuredClone。 */
  clone(map: CustomMap): CustomMap {
    const { assets, ...model } = map;
    return { ...map, ...structuredClone(model), ...(assets ? { assets: assets.map((asset) => ({ ...asset })) } : {}) };
  }
  /** 在历史截断/新分支后回收不再被任何快照或命令引用的图片。 */
  collect(references: Array<string | undefined>): void {
    const live = new Set<string>();
    for (const reference of references) {
      if (!reference) continue;
      for (const match of reference.matchAll(/"(editor-image-\d+)"/g)) live.add(match[1]);
    }
    for (const [token, data] of this.payloads) {
      if (!live.has(token)) { this.payloads.delete(token); this.tokens.delete(data); }
    }
  }
  stats(): { images: number; payloadChars: number } {
    return { images: this.payloads.size, payloadChars: [...this.payloads.values()].reduce((sum, data) => sum + data.length, 0) };
  }
}
