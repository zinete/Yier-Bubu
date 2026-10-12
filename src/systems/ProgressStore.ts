import { levels, nextLevelId } from '../levels';
interface RecordData { bestScore: number; allCollected: boolean }
interface Progress {
  version: 1; currentLevel: string; unlocked: string[];
  records: Record<string, RecordData>; started: boolean;
}
const KEY = 'yierBubuProgress';
const defaults = (): Progress => ({
  version: 1, currentLevel: levels[0].id, unlocked: [levels[0].id], records: {}, started: false,
});
let memory = defaults();
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.unlocked)) return defaults();
    const known = levels.map((level) => level.id);
    const unlocked = known.filter((id) => id === known[0] || value.unlocked.includes(id));
    const records: Progress['records'] = {};
    for (const id of unlocked) {
      const record = value.records?.[id];
      if (Number.isFinite(record?.bestScore) && record.bestScore >= 0)
        records[id] = { bestScore: record.bestScore, allCollected: record.allCollected === true };
    }
    memory = {
      version: 1, unlocked, records, started: value.started === true,
      currentLevel: unlocked.includes(value.currentLevel) ? value.currentLevel : known[0],
    };
  } catch { /* 存储不可用或损坏时仍可游玩。 */ }
  return memory;
}
function save(progress: Progress): void {
  memory = progress;
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* 使用内存存档。 */ }
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
