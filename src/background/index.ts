import { SPEED_CHANGED_MESSAGE } from '../shared/types';

const BADGE_COLOR = '#0ea5e9';

const formatBadge = (speed: number) =>
  speed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const applyBadgeColor = () => {
  void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
};

chrome.runtime.onInstalled.addListener(applyBadgeColor);
applyBadgeColor();

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (typeof message !== 'object' || message === null) {
    return;
  }

  const { type, speed } = message as { type?: unknown; speed?: unknown };
  if (type !== SPEED_CHANGED_MESSAGE || sender.tab?.id == null) {
    return;
  }

  const rate = typeof speed === 'number' && Number.isFinite(speed) ? speed : 1;
  const text = Math.abs(rate - 1) < 1e-6 ? '' : formatBadge(rate);
  void chrome.action.setBadgeText({ tabId: sender.tab.id, text });
});
