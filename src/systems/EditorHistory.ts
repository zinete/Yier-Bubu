type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface EditorPatch { path: Array<string | number>; before: Json; after: Json }
export interface EditorCommand { patches: EditorPatch[]; bytes: number }
export const HISTORY_LIMIT = 50;
export const HISTORY_BYTES = 8 * 1024 * 1024;
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);
/** 已去掉图片载荷的差量命令。数组结构变化记录该数组，普通坐标修改只记录字段。 */
export function createEditorCommand(before: string, after: string): EditorCommand | undefined {
  if (before === after) return;
  const patches: EditorPatch[] = [];
  const visit = (a: Json, b: Json, path: EditorPatch['path']): void => {
    if (same(a, b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        a.forEach((value, index) => visit(value, b[index], [...path, index])); return;
      }
      if (!Array.isArray(a) && !Array.isArray(b) && JSON.stringify(Object.keys(a)) === JSON.stringify(Object.keys(b))) {
        Object.keys(a).forEach((key) => visit(a[key], b[key], [...path, key])); return;
      }
    }
    // 键增删/顺序变化整体替换父节点，确保撤销后字段顺序与保存快照完全相同。
    patches.push({ path, before: a, after: b });
  };
  visit(JSON.parse(before) as Json, JSON.parse(after) as Json, []);
  return patches.length ? { patches, bytes: JSON.stringify(patches).length * 2 } : undefined;
}
/** 先在私有候选副本应用全部 patch，前置状态不匹配则拒绝，不产生半次撤销。 */
export function applyEditorCommand(snapshot: string, command: EditorCommand, reverse: boolean): string {
  let model = JSON.parse(snapshot) as Json;
  for (const patch of command.patches) {
    const expected = reverse ? patch.after : patch.before, replacement = reverse ? patch.before : patch.after;
    if (!patch.path.length) {
      if (!same(model, expected)) throw new Error('编辑历史状态不匹配，请先导出当前地图备份');
      model = JSON.parse(JSON.stringify(replacement)) as Json; continue;
    }
    let parent = model as Record<string | number, Json>;
    for (const key of patch.path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object') throw new Error('编辑历史路径已失效');
      parent = parent[key] as Record<string | number, Json>;
    }
    const key = patch.path.at(-1)!;
    if (!parent || !same(parent[key], expected)) throw new Error('编辑历史状态不匹配，请先导出当前地图备份');
    parent[key] = JSON.parse(JSON.stringify(replacement)) as Json;
  }
  return JSON.stringify(model);
}
export function trimEditorHistory(commands: EditorCommand[]): void {
  let bytes = commands.reduce((sum, command) => sum + command.bytes, 0);
  while (commands.length > HISTORY_LIMIT || (commands.length > 1 && bytes > HISTORY_BYTES)) bytes -= commands.shift()!.bytes;
}
