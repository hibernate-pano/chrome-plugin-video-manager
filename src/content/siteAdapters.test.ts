import { describe, expect, it } from 'vitest';
import { getSiteAdapter } from './siteAdapters';

/**
 * 站点适配器的**数据**守卫。
 *
 * 这些是「站点的事实」，不是逻辑 —— 逻辑在 keyboardController 里测。
 * 这里守的是：哪些站点让路、让哪些键、以及域名匹配必须是后缀。
 *
 * ⚠️ 「站点在 keyup 上处理哪些键」这份清单是**逐个站点核实**出来的，
 * 不要凭印象往里加：多让一个键 = 扩展在那个键上失效；
 * 少让一个键 = 那个键会被切换两次（净效果为零）。
 */
describe('站点适配器', () => {
  it('YouTube 声明「在 keyup 上处理空格与 k」', () => {
    // YouTube 的播放/暂停有完整原生实现，而实现挂在 keyup 上。
    // 我们在 keydown 拦截一次、它的 keyup 再切换一次 = 一次按键两次切换。
    const adapter = getSiteAdapter('www.youtube.com');

    expect(adapter.nativeKeyHandling).toContain(' ');
    expect(adapter.nativeKeyHandling).toContain('k');
  });

  it('YouTube 的方向键与全屏键**不**让路', () => {
    // ⚠️ 让路是按键级的：把方向键/全屏键也列进去，
    // 扩展在 YouTube 上就彻底失去快进与网页全屏 —— 那是最不该被牺牲的两项。
    const adapter = getSiteAdapter('www.youtube.com');

    expect(adapter.nativeKeyHandling).not.toContain('ArrowLeft');
    expect(adapter.nativeKeyHandling).not.toContain('ArrowRight');
    expect(adapter.nativeKeyHandling).not.toContain('f');
  });

  it('其余站点一律不让路（没有核实过的键位就不写）', () => {
    for (const hostname of [
      'www.bilibili.com',
      'www.iqiyi.com',
      'v.qq.com',
      'www.youku.com',
      'www.mgtv.com',
      'localhost',
      '127.0.0.1',
      'example.com',
    ]) {
      expect(
        getSiteAdapter(hostname).nativeKeyHandling,
        `${hostname} 不该让路任何键`,
      ).toEqual([]);
    }
  });

  it('域名匹配必须是后缀：notyoutube.com 不算 YouTube', () => {
    // 曾经用 `hostname.includes('youtube.com')` ——
    // 那会把 notyoutube.com 这类域名也当成 YouTube。
    expect(getSiteAdapter('notyoutube.com').nativeKeyHandling).toEqual([]);
    expect(getSiteAdapter('youtube.com.evil.example').nativeKeyHandling).toEqual([]);
  });

  it('子域名仍然算 YouTube', () => {
    expect(getSiteAdapter('www.youtube.com').nativeKeyHandling).toContain(' ');
    expect(getSiteAdapter('m.youtube.com').nativeKeyHandling).toContain(' ');
    expect(getSiteAdapter('youtu.be').nativeKeyHandling).toContain(' ');
  });
});
