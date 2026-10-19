// 项目自带的程序音频：正弦波旋律和事件音效，无外部录音依赖。
export function generatedAudio(): Record<string, string> {
  const themes: Record<string, number[]> = {
    jump: [330, 440, 660], throw: [520, 390], hurt: [220, 140, 90],
    coin: [880, 1320], 'enemy-hit': [440, 220], win: [523, 659, 784, 1047],
    lose: [392, 330, 262, 196],
    'shield-on': [440, 660, 880], 'shield-block': [1047, 784, 523],
    music: [262, 330, 392, 330, 294, 349, 440, 349, 330, 392, 523, 392, 294, 349, 392, 294],
  };
  const result: Record<string, string> = {};
  for (const [key, notes] of Object.entries(themes)) {
    const rate = 22050;
    const duration = key === 'music' ? 0.35 : key === 'win' || key === 'lose' ? 0.15 : 0.065;
    const count = Math.ceil(rate * duration * notes.length);
    const bytes = new Uint8Array(44 + count * 2);
    const view = new DataView(bytes.buffer);
    const label = (offset: number, text: string): void => {
      for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
    };
    label(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); label(8, 'WAVE');
    label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    label(36, 'data'); view.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i += 1) {
      const time = i / rate;
      const index = Math.min(notes.length - 1, Math.floor(time / duration));
      const local = time - index * duration;
      const envelope = Math.min(1, local / 0.008) * Math.max(0, 1 - local / duration);
      const sample = Math.sin(2 * Math.PI * notes[index] * local) * envelope * 0.28;
      view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
    }
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    result[key] = `data:audio/wav;base64,${btoa(binary)}`;
  }
  return result;
}
