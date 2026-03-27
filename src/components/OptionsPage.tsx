import { useEffect, useMemo, useState } from 'react';
import ShortcutEditor from './Settings/ShortcutEditor';
import { useSettingsStore } from '../stores/settingsStore';
import {
  BookmarkRecord,
  LearningDashboardData,
  ResumeRecord,
  formatMediaTime,
  getLearningDashboardData,
} from '../core/learningMemory';

const EXTRA_PRESET_OPTIONS = [0.25, 0.5, 3, 4];

const countConflicts = (values: string[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
      return;
    }

    seen.add(value);
  });

  return duplicates;
};

function ContinueCard({ item }: { item: ResumeRecord }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition hover:border-cyan-300/30 hover:bg-cyan-400/[0.04]"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/65">{item.hostname}</p>
      <h3 className="mt-2 line-clamp-2 text-base font-medium text-white">{item.title}</h3>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
        <span>继续到 {formatMediaTime(item.currentTime)}</span>
        <span>{item.playbackRate}x</span>
      </div>
    </a>
  );
}

function BookmarkCard({ item }: { item: BookmarkRecord }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition hover:border-cyan-300/30 hover:bg-cyan-400/[0.04]"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/65">{item.hostname}</p>
      <h3 className="mt-2 line-clamp-2 text-base font-medium text-white">{item.title}</h3>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
        <span>片段 {formatMediaTime(item.timestamp)}</span>
        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
      </div>
    </a>
  );
}

export default function OptionsPage() {
  const {
    shortcuts,
    resetShortcuts,
    presets,
    addPreset,
    removePreset,
    speedProfiles,
    activeProfileId,
    setActiveProfile,
    resumeEnabled,
    setResumeEnabled,
    hydrate,
    hasHydrated,
  } = useSettingsStore();
  const [dashboardData, setDashboardData] = useState<LearningDashboardData>({
    bookmarks: [],
    resumeQueue: [],
  });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    void getLearningDashboardData().then(setDashboardData);
  }, [hasHydrated, activeProfileId, resumeEnabled]);

  const shortcutConflicts = useMemo(
    () => countConflicts(Object.values(shortcuts)),
    [shortcuts],
  );

  return (
    <div className="min-h-screen bg-[#07111f] px-6 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="overflow-hidden rounded-[32px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.92))] p-8 shadow-[0_24px_90px_rgba(2,6,23,0.45)]">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300/80">Learning Playback OS</p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-cyan-50">Video Speed Controller</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                从单纯的调速插件，升级成跨站点的学习播放工作台。现在会记住你的模式、续播进度和关键片段。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <div className="text-sm text-slate-400">当前模式</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {speedProfiles.find((profile) => profile.id === activeProfileId)?.name ?? '学习模式'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <div className="text-sm text-slate-400">继续播放</div>
                <div className="mt-2 text-2xl font-semibold text-white">{dashboardData.resumeQueue.length}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <div className="text-sm text-slate-400">关键片段</div>
                <div className="mt-2 text-2xl font-semibold text-white">{dashboardData.bookmarks.length}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[28px] border border-cyan-400/12 bg-slate-950/70 p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">学习模式</h2>
              <p className="mt-2 text-sm text-slate-400">为不同观看意图预设节奏，进入页面时自动应用。</p>
            </div>
            <label className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200">
              <span>自动续播</span>
              <button
                type="button"
                onClick={() => setResumeEnabled(!resumeEnabled)}
                className={resumeEnabled ? 'relative h-6 w-11 rounded-full bg-cyan-400 transition' : 'relative h-6 w-11 rounded-full bg-slate-700 transition'}
              >
                <span
                  className={resumeEnabled ? 'absolute left-[22px] top-1 h-4 w-4 rounded-full bg-slate-950 transition' : 'absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition'}
                />
              </button>
            </label>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            {speedProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setActiveProfile(profile.id)}
                className={profile.id === activeProfileId
                  ? 'rounded-3xl border border-cyan-300/35 bg-cyan-400/[0.08] p-5 text-left shadow-[0_10px_40px_rgba(34,211,238,0.12)]'
                  : 'rounded-3xl border border-white/8 bg-white/[0.03] p-5 text-left transition hover:border-cyan-300/20 hover:bg-white/[0.05]'}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm uppercase tracking-[0.2em] text-cyan-300/70">{profile.icon}</span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{profile.speed}x</span>
                </div>
                <h3 className="mt-6 text-xl font-semibold text-white">{profile.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{profile.description}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-cyan-400/12 bg-slate-950/70 p-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">快捷键设置</h2>
                <p className="mt-1 text-sm text-slate-400">点击后直接录入。避免和网页常用键位冲突。</p>
              </div>
              <button
                type="button"
                onClick={resetShortcuts}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300 hover:text-white"
              >
                重置默认
              </button>
            </div>

            {shortcutConflicts.size > 0 ? (
              <div className="mb-5 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                检测到重复快捷键：{Array.from(shortcutConflicts).join(', ')}
              </div>
            ) : null}

            <ShortcutEditor shortcuts={shortcuts} />
          </div>

          <div className="space-y-8">
            <section className="rounded-[28px] border border-cyan-400/12 bg-slate-950/70 p-8">
              <h2 className="text-xl font-semibold text-white">速度预设</h2>
              <p className="mt-1 text-sm text-slate-400">Lightbox 控制条会直接读取这里的预设速度。</p>

              <div className="mt-5 flex flex-wrap gap-3">
                {presets.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => removePreset(speed)}
                    className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/20"
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {EXTRA_PRESET_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => addPreset(speed)}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300 hover:text-white"
                  >
                    + {speed}x
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-cyan-400/12 bg-slate-950/70 p-8">
              <h2 className="text-xl font-semibold text-white">继续播放</h2>
              <p className="mt-1 text-sm text-slate-400">最近暂停过、下次打开会自动提示续播的视频。</p>

              <div className="mt-5 grid gap-3">
                {dashboardData.resumeQueue.length > 0 ? dashboardData.resumeQueue.slice(0, 4).map((item) => (
                  <ContinueCard key={item.pageKey} item={item} />
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                    还没有可继续的视频。打开任意视频页，暂停后就会出现在这里。
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-[28px] border border-cyan-400/12 bg-slate-950/70 p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">关键片段</h2>
              <p className="mt-1 text-sm text-slate-400">在 Lightbox 里点书签按钮，就能把当前时间点存下来。</p>
            </div>
            <div className="text-sm text-slate-400">{dashboardData.bookmarks.length} 个最近片段</div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dashboardData.bookmarks.length > 0 ? dashboardData.bookmarks.slice(0, 6).map((item) => (
              <BookmarkCard key={item.id} item={item} />
            )) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                还没有收藏片段。先在视频里存一个关键时间点。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
