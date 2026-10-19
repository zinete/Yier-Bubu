import { loadProgress, retryProgressStorage, subscribeProgressStorage } from './ProgressStore';

/** Non-blocking, local-only notice: never uploads a player's save data. */
export function mountProgressNotice(): () => void {
  const notice = document.createElement('section');
  notice.className = 'progress-notice';
  notice.hidden = true;
  notice.setAttribute('aria-label', '本地存档状态');
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const retry = document.createElement('button');
  retry.type = 'button';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = '知道了';
  notice.append(message, retry, dismiss);
  document.body.append(notice);
  const unsubscribe = subscribeProgressStorage((status) => {
    notice.hidden = status.mode === 'persistent';
    retry.textContent = status.pending ? '重试保存' : '重试读取';
    message.textContent = status.pending
      ? '本次进度暂未保存到浏览器，刷新或关闭后可能丢失。你仍可继续游玩。'
      : status.reason === 'invalid-data'
        ? '无法读取原存档，本次先使用内存进度。开始新游戏会尝试写入新存档。'
        : '浏览器存储暂不可读取，本次先使用内存进度。刷新或关闭前请注意。';
  });
  const onRetry = () => {
    if (!retryProgressStorage()) {
      notice.hidden = false;
      message.textContent = '存档仍不可用；本次进度暂留在内存中，请勿刷新或关闭页面。';
    }
  };
  const onDismiss = () => { notice.hidden = true; };
  retry.addEventListener('click', onRetry);
  dismiss.addEventListener('click', onDismiss);
  loadProgress();
  return () => {
    unsubscribe();
    retry.removeEventListener('click', onRetry);
    dismiss.removeEventListener('click', onDismiss);
    notice.remove();
  };
}
