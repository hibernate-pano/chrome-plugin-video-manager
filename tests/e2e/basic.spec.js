import { test, expect } from '@playwright/test';

test.describe('Video Speed Controller E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html');
  });

  test('should detect video element on page', async ({ page }) => {
    const video = page.locator('video');
    await expect(video).toBeVisible();
  });

  test('should show indicator when speed changes', async ({ page }) => {
    const indicator = page.locator('#video-speed-indicator');
    
    await page.keyboard.press('=');
    
    await expect(indicator).toBeVisible();
  });

  test('should increase playback speed', async ({ page }) => {
    const video = page.locator('video');
    
    await page.keyboard.press('=');
    
    const speed = await video.evaluate((v) => v.playbackRate);
    expect(speed).toBeGreaterThan(1);
  });

  test('should decrease playback speed', async ({ page }) => {
    const video = page.locator('video');
    
    await page.keyboard.press('-');
    
    const speed = await video.evaluate((v) => v.playbackRate);
    expect(speed).toBeLessThan(1);
  });

  test('should reset speed to 1x', async ({ page }) => {
    const video = page.locator('video');
    
    await page.keyboard.press('=');
    await page.keyboard.press('=');
    await page.keyboard.press('0');
    
    const speed = await video.evaluate((v) => v.playbackRate);
    expect(speed).toBe(1);
  });

  test('should enter lightbox mode', async ({ page }) => {
    await page.keyboard.press('f');
    
    const lightbox = page.locator('#vsc-lightbox-overlay');
    await expect(lightbox).toBeVisible();
  });

  test('should exit lightbox mode with Escape', async ({ page }) => {
    await page.keyboard.press('f');
    
    const lightbox = page.locator('#vsc-lightbox-overlay');
    await expect(lightbox).toBeVisible();
    
    await page.keyboard.press('Escape');
    
    await expect(lightbox).not.toBeVisible();
  });

  test('should seek forward in lightbox mode', async ({ page }) => {
    await page.keyboard.press('f');
    
    const video = page.locator('#vsc-lightbox-overlay video');
    const initialTime = await video.evaluate((v) => v.currentTime);
    
    await page.keyboard.press('ArrowRight');
    
    const newTime = await video.evaluate((v) => v.currentTime);
    expect(newTime).toBeGreaterThan(initialTime);
  });

  test('should adjust volume in lightbox mode', async ({ page }) => {
    await page.keyboard.press('f');
    const video = page.locator('#vsc-lightbox-overlay video');
    
    await page.keyboard.press('ArrowUp');
    
    const volume = await video.evaluate((v) => v.volume);
    expect(volume).toBeGreaterThan(0);
  });

  test('should not trigger in editable fields', async ({ page }) => {
    const input = page.locator('input[type="text"]');
    await input.focus();
    
    await page.keyboard.press('=');
    
    const video = page.locator('video');
    const speed = await video.evaluate((v) => v.playbackRate);
    expect(speed).toBe(1);
  });
});
