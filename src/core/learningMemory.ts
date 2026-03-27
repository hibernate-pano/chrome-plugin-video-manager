import { extensionStorage } from '../utils/extensionStorage';

const BOOKMARKS_KEY = 'vsc-learning-bookmarks';
const RESUME_KEY = 'vsc-learning-resume';
const MAX_BOOKMARKS = 200;
const MAX_RESUME_ITEMS = 100;

export interface BookmarkRecord {
  id: string;
  pageKey: string;
  url: string;
  title: string;
  hostname: string;
  timestamp: number;
  duration: number;
  createdAt: number;
}

export interface ResumeRecord {
  pageKey: string;
  url: string;
  title: string;
  hostname: string;
  currentTime: number;
  duration: number;
  playbackRate: number;
  updatedAt: number;
}

export interface LearningDashboardData {
  bookmarks: BookmarkRecord[];
  resumeQueue: ResumeRecord[];
}

const normalizeUrl = (input: string) => {
  try {
    const url = new URL(input);
    url.hash = '';
    return url.toString();
  } catch {
    return input;
  }
};

const createPageKey = (url: string) => normalizeUrl(url);

const createMediaSnapshot = (media: HTMLMediaElement) => ({
  pageKey: createPageKey(window.location.href),
  url: normalizeUrl(window.location.href),
  title: document.title || 'Untitled video',
  hostname: window.location.hostname,
  duration: Number.isFinite(media.duration) ? Number(media.duration.toFixed(2)) : 0,
});

export const formatMediaTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export async function addBookmark(media: HTMLMediaElement): Promise<BookmarkRecord> {
  const bookmarks = await extensionStorage.get<BookmarkRecord[]>('local', BOOKMARKS_KEY, []);
  const snapshot = createMediaSnapshot(media);
  const bookmark: BookmarkRecord = {
    id: `bookmark_${Date.now()}`,
    ...snapshot,
    timestamp: Number(media.currentTime.toFixed(2)),
    createdAt: Date.now(),
  };

  const nextBookmarks = [bookmark, ...bookmarks]
    .slice(0, MAX_BOOKMARKS);

  await extensionStorage.set('local', BOOKMARKS_KEY, nextBookmarks);
  return bookmark;
}

export async function getRecentBookmarks(limit = 8): Promise<BookmarkRecord[]> {
  const bookmarks = await extensionStorage.get<BookmarkRecord[]>('local', BOOKMARKS_KEY, []);
  return bookmarks
    .slice()
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit);
}

export async function getBookmarksForCurrentPage(): Promise<BookmarkRecord[]> {
  const pageKey = createPageKey(window.location.href);
  const bookmarks = await extensionStorage.get<BookmarkRecord[]>('local', BOOKMARKS_KEY, []);
  return bookmarks
    .filter((bookmark) => bookmark.pageKey === pageKey)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export async function saveResumePosition(media: HTMLMediaElement): Promise<void> {
  if (!Number.isFinite(media.duration) || media.duration <= 0) {
    return;
  }

  const resumeQueue = await extensionStorage.get<ResumeRecord[]>('local', RESUME_KEY, []);
  const snapshot = createMediaSnapshot(media);
  const currentTime = Number(media.currentTime.toFixed(2));

  const filtered = resumeQueue.filter((item) => item.pageKey !== snapshot.pageKey);

  if (currentTime < 5 || currentTime >= media.duration - 15) {
    await extensionStorage.set('local', RESUME_KEY, filtered);
    return;
  }

  const nextRecord: ResumeRecord = {
    ...snapshot,
    currentTime,
    playbackRate: Number(media.playbackRate.toFixed(2)),
    updatedAt: Date.now(),
  };

  await extensionStorage.set(
    'local',
    RESUME_KEY,
    [nextRecord, ...filtered]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_RESUME_ITEMS),
  );
}

export async function clearResumePosition(url = window.location.href): Promise<void> {
  const pageKey = createPageKey(url);
  const resumeQueue = await extensionStorage.get<ResumeRecord[]>('local', RESUME_KEY, []);
  await extensionStorage.set(
    'local',
    RESUME_KEY,
    resumeQueue.filter((item) => item.pageKey !== pageKey),
  );
}

export async function getResumePositionForCurrentPage(): Promise<ResumeRecord | null> {
  const pageKey = createPageKey(window.location.href);
  const resumeQueue = await extensionStorage.get<ResumeRecord[]>('local', RESUME_KEY, []);
  return resumeQueue.find((item) => item.pageKey === pageKey) ?? null;
}

export async function getLearningDashboardData(): Promise<LearningDashboardData> {
  const [bookmarks, resumeQueue] = await Promise.all([
    extensionStorage.get<BookmarkRecord[]>('local', BOOKMARKS_KEY, []),
    extensionStorage.get<ResumeRecord[]>('local', RESUME_KEY, []),
  ]);

  return {
    bookmarks: bookmarks
      .slice()
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 10),
    resumeQueue: resumeQueue
      .slice()
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 10),
  };
}
