import { levels, nextLevelId } from '../levels';
interface RecordData { bestScore: number; allCollected: boolean }
export interface Progress {
  version: 1; currentLevel: string; unlocked: string[];
  records: Record<string, RecordData>; started: boolean;
}
const KEY = 'yierBubuProgress';
const defaults = (): Progress => ({
  version: 1, currentLevel: levels[0].id, unlocked: [levels[0].id], records: {}, started: false,
});
let memory = defaults();
export interface ProgressStorageStatus {
  mode: 'persistent' | 'memory'; pending: boolean;
  reason?: 'read-failed' | 'write-failed' | 'invalid-data';
}
let storageStatus: ProgressStorageStatus = { mode: 'persistent', pending: false };
const listeners = new Set<(status: ProgressStorageStatus) => void>();
function copy(progress: Progress): Progress {
  return { ...progress, unlocked: [...progress.unlocked], records: Object.fromEntries(
    Object.entries(progress.records).map(([id, record]) => [id, { ...record }]),
  ) };
}
function setStorageStatus(status: ProgressStorageStatus): void {
  if (JSON.stringify(storageStatus) === JSON.stringify(status)) return;
  storageStatus = status;
  for (const listener of listeners) listener({ ...status });
}
export function getProgressStorageStatus(): ProgressStorageStatus { return { ...storageStatus }; }
export function subscribeProgressStorage(listener: (status: ProgressStorageStatus) => void): () => void {
  listeners.add(listener);
  listener(getProgressStorageStatus());
  return () => listeners.delete(listener);
}
function decode(raw: string): Progress {
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.unlocked)) throw new Error('Invalid progress');
  const known = levels.map((level) => level.id);
  const unlocked = known.filter((id) => id === known[0] || value.unlocked.includes(id));
  const records: Progress['records'] = {};
  for (const id of unlocked) {
    const record = value.records?.[id];
    if (Number.isFinite(record?.bestScore) && record.bestScore >= 0)
      records[id] = { bestScore: record.bestScore, allCollected: record.allCollected === true };
  }
  return {
    version: 1, unlocked, records, started: value.started === true,
    currentLevel: unlocked.includes(value.currentLevel) ? value.currentLevel : known[0],
  };
}
export function loadProgress(): Progress {
  // A failed write makes memory authoritative until it has been persisted.
  if (storageStatus.pending) return copy(memory);
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    setStorageStatus({ mode: 'memory', pending: false, reason: 'read-failed' });
    return copy(memory);
  }
  try {
    memory = raw === null ? defaults() : decode(raw);
    setStorageStatus({ mode: 'persistent', pending: false });
  } catch { setStorageStatus({ mode: 'memory', pending: false, reason: 'invalid-data' }); }
  return copy(memory);
}
function save(progress: Progress): boolean {
  memory = copy(progress);
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
    setStorageStatus({ mode: 'persistent', pending: false });
    return true;
  } catch {
    setStorageStatus({ mode: 'memory', pending: true, reason: 'write-failed' });
    return false;
  }
}
export function retryProgressStorage(): boolean {
  if (!storageStatus.pending) {
    loadProgress();
    return storageStatus.mode === 'persistent';
  }
  const local = copy(memory);
  // A different tab may have advanced while this tab could not write.
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) {
      const remote = decode(raw);
      local.unlocked = levels.map((level) => level.id).filter((id) => local.unlocked.includes(id) || remote.unlocked.includes(id));
      local.started ||= remote.started;
      for (const [id, record] of Object.entries(remote.records)) {
        local.records[id] = {
          bestScore: Math.max(local.records[id]?.bestScore ?? 0, record.bestScore),
          allCollected: (local.records[id]?.allCollected ?? false) || record.allCollected,
        };
      }
    }
  } catch { /* Keep the last known good in-memory progress. */ }
  return save(local);
}
export function beginLevel(id: string): string {
  const progress = loadProgress();
  progress.currentLevel = progress.unlocked.includes(id) ? id : levels[0].id;
  progress.started = true;
  save(progress);
  return progress.currentLevel;
}
export function completeLevel(id: string, score: number, allCollected: boolean): void {
  const progress = loadProgress();
  if (!levels.some((level) => level.id === id) || !progress.unlocked.includes(id) || !Number.isFinite(score) || score < 0) return;
  const previous = progress.records[id];
  progress.records[id] = {
    bestScore: Math.max(previous?.bestScore ?? 0, score),
    allCollected: (previous?.allCollected ?? false) || allCollected,
  };
  const next = nextLevelId(id);
  if (next && !progress.unlocked.includes(next)) progress.unlocked.push(next);
  progress.currentLevel = next ?? id;
  save(progress);
}
