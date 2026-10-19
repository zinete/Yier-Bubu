import { DRAFT_KEY, parseCustomMap, type CustomMap } from './CustomMap';

export const RECOVERY_KEY = `${DRAFT_KEY}:recovery`;
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface DraftEnvelope { kind: 'editor-draft'; version: 1; updatedAt: number; nonce: string; map: CustomMap }
interface RecoveryEnvelope { kind: 'editor-recovery'; version: 1; updatedAt: number; baseRevision: string | null; map: CustomMap }
export interface DraftLoad {
  map?: CustomMap; savedMap?: CustomMap; revision: string | null;
  restored: boolean; savedAt?: number; warnings: string[];
  readFailed: boolean;
}
export type DraftWrite = { ok: true; revision: string; updatedAt: number } | { ok: false; error: string };

/** 本地并发检测标记，不用于安全校验；双 32 位散列加长度避免在备份中重复大图数据。 */
function revisionOf(raw: string | null): string | null {
  if (raw === null) return null;
  let a = 2166136261, b = 5381;
  for (let i = 0; i < raw.length; i++) {
    a = Math.imul(a ^ raw.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ raw.charCodeAt(i);
  }
  return `${raw.length}:${a >>> 0}:${b >>> 0}`;
}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('草稿格式不正确');
  return input as Record<string, unknown>;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('草稿时间无效');
  return value;
}
/** 手动保存与自动恢复分开，备份失败不会破坏上一次成功保存的地图。 */
export class EditorDraftStore {
  private recoveryRaw: string | null = null;
  private saveSerial = 0;
  constructor(private readonly storage: () => DraftStorage, private readonly now = () => Date.now()) {}
  load(): DraftLoad {
    const result: DraftLoad = { revision: null, restored: false, readFailed: false, warnings: [] };
    let raw: string | null = null;
    try {
      raw = this.storage().getItem(DRAFT_KEY); result.revision = revisionOf(raw);
      if (raw !== null) {
        const root = object(JSON.parse(raw));
        if (root.kind === 'editor-draft') {
          if (root.version !== 1) throw new Error('不支持的草稿存储版本');
          result.savedAt = timestamp(root.updatedAt); result.savedMap = parseCustomMap(root.map, false);
        } else result.savedMap = parseCustomMap(root, false); // 兼容旧版裸地图草稿。
        result.map = result.savedMap;
      }
    } catch { result.readFailed = true; result.warnings.push('已保存草稿无法读取；不会自动覆盖原记录，请保留导出备份。'); }
    try {
      const backup = this.storage().getItem(RECOVERY_KEY);
      this.recoveryRaw = backup;
      if (backup !== null) {
        const record = object(JSON.parse(backup));
        if (record.kind !== 'editor-recovery' || record.version !== 1 ||
          (record.baseRevision !== null && typeof record.baseRevision !== 'string')) throw new Error('恢复记录格式错误');
        timestamp(record.updatedAt);
        const recovered = parseCustomMap(record.map, false);
        if ((record.baseRevision === result.revision || !result.savedMap) && JSON.stringify(recovered) !== JSON.stringify(result.savedMap)) {
          result.map = recovered; result.restored = true;
        }
      }
    } catch { result.warnings.push('自动恢复记录无法读取；当前已保存地图保持不变。'); }
    return result;
  }
  save(map: CustomMap, expectedRevision: string | null): DraftWrite {
    try {
      parseCustomMap(map, false);
      const storage = this.storage();
      if (revisionOf(storage.getItem(DRAFT_KEY)) !== expectedRevision)
        return { ok: false, error: '草稿已在其他页面发生变化，已阻止覆盖。请先导出当前地图，再刷新核对。' };
      if (storage.getItem(RECOVERY_KEY) !== this.recoveryRaw)
        return { ok: false, error: '自动备份已被其他页面修改，已阻止覆盖。请先导出当前地图，再刷新核对。' };
      const updatedAt = this.now();
      const record: DraftEnvelope = { kind: 'editor-draft', version: 1, updatedAt,
        nonce: `${updatedAt}-${++this.saveSerial}-${Math.random().toString(36).slice(2)}`, map };
      const raw = JSON.stringify(record);
      storage.setItem(DRAFT_KEY, raw);
      // 主记录写入已成功，清理旧备份失败不能误报保存失败；加载会检查 baseRevision。
      try { storage.removeItem(RECOVERY_KEY); this.recoveryRaw = null; } catch { /* 过期备份不会覆盖新版本。 */ }
      return { ok: true, revision: revisionOf(raw)!, updatedAt };
    } catch { return { ok: false, error: '保存失败：地图无效或浏览器存储不可用/空间不足。编辑内容仍在，请先导出文件备份。' }; }
  }
  backup(map: CustomMap, baseRevision: string | null): DraftWrite {
    try {
      parseCustomMap(map, false);
      const storage = this.storage();
      if (revisionOf(storage.getItem(DRAFT_KEY)) !== baseRevision)
        return { ok: false, error: '其他页面更新了草稿，已暂停自动备份以避免冲突，请导出当前地图。' };
      if (storage.getItem(RECOVERY_KEY) !== this.recoveryRaw)
        return { ok: false, error: '其他页面修改了自动备份，已暂停覆盖，请先导出当前地图。' };
      const updatedAt = this.now();
      const record: RecoveryEnvelope = { kind: 'editor-recovery', version: 1, updatedAt, baseRevision, map };
      const raw = JSON.stringify(record); storage.setItem(RECOVERY_KEY, raw); this.recoveryRaw = raw;
      return { ok: true, revision: revisionOf(raw)!, updatedAt };
    } catch { return { ok: false, error: '自动备份失败，当前编辑尚未落盘；请尝试保存或导出地图。' }; }
  }
  clearRecovery(baseRevision: string | null): { ok: boolean; error?: string } {
    try {
      const storage = this.storage();
      if (revisionOf(storage.getItem(DRAFT_KEY)) !== baseRevision || storage.getItem(RECOVERY_KEY) !== this.recoveryRaw)
        return { ok: false, error: '其他页面修改了草稿或备份，未删除它的恢复记录，请导出当前地图后刷新核对。' };
      storage.removeItem(RECOVERY_KEY); this.recoveryRaw = null; return { ok: true };
    } catch { return { ok: false, error: '旧自动备份清理失败，请手动保存确认当前版本，避免刷新恢复已撤销的内容。' }; }
  }
}
