import zlib from 'node:zlib';

/**
 * 极简 PNG 解码器（不引第三方依赖）。
 *
 * 为什么需要它：扩展的提示（胶囊、角标、控制条）有一大半是**纯视觉**的 ——
 * 位置、对齐、对比度、层级都没法靠 DOM 断言确认，只能看浏览器**真的画成了什么样**。
 * 截图 + 逐像素取样是唯一诚实的办法。
 *
 * 只支持 8bit 的 PNG（Playwright 的 `page.screenshot({ type: 'png' })` 就是这种），
 * 其余一律返回 null —— 宁可说「测不了」，也不要给出一个看起来像数的错答案。
 */
export const decodePng = (png) => {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;

    if (type === 'IHDR') {
      width = png.readUInt32BE(dataStart);
      height = png.readUInt32BE(dataStart + 4);
      // ⚠️ 位深与颜色类型是**单字节**，用 readUInt32BE 读会把后面的字节也吃进来。
      bitDepth = png[dataStart + 8];
      colorType = png[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(png.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataStart + length + 4;
  }

  if (bitDepth !== 8) {
    return null;
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) {
    return null;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  let src = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[src];
    src += 1;
    for (let i = 0; i < stride; i += 1) {
      const raw = inflated[src + i];
      const left = i >= channels ? pixels[row * stride + i - channels] : 0;
      const up = row > 0 ? pixels[(row - 1) * stride + i] : 0;
      const upLeft = row > 0 && i >= channels ? pixels[(row - 1) * stride + i - channels] : 0;

      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upLeft);
      else return null;

      pixels[row * stride + i] = value & 0xff;
    }
    src += stride;
  }

  const pixelAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return null;
    }
    const index = (y * width + x) * channels;
    // 灰度图（1 通道）与 灰度+透明（2 通道）没有独立的 RGB，取灰度值当三通道用。
    if (channels === 1 || channels === 2) {
      const gray = pixels[index];
      return [gray, gray, gray];
    }
    return [pixels[index], pixels[index + 1], pixels[index + 2]];
  };

  return { width, height, channels, pixelAt };
};

/** 单点取样（解码失败返回 null）。 */
export const readPixel = (png, x, y) => decodePng(png)?.pixelAt(x, y) ?? null;

/**
 * 沿某一列从上往下找第一个满足条件的像素，返回它的 y。
 *
 * 找不到返回 null —— 调用方必须区分「没找到」和「找到 0」，否则会把
 * 「画面里根本没有这个东西」误判成「它在 y=0」。
 */
export const findFirstInColumn = (png, x, predicate, maxY = Infinity) => {
  const image = decodePng(png);
  if (!image) {
    return null;
  }
  const limit = Math.min(image.height, Math.floor(maxY));
  for (let y = 0; y < limit; y += 1) {
    const pixel = image.pixelAt(x, y);
    if (pixel && predicate(pixel)) {
      return y;
    }
  }
  return null;
};

/** 沿某一行从左往右找第一个满足条件的像素，返回它的 x。 */
export const findFirstInRow = (png, y, predicate, maxX = Infinity) => {
  const image = decodePng(png);
  if (!image) {
    return null;
  }
  const limit = Math.min(image.width, Math.floor(maxX));
  for (let x = 0; x < limit; x += 1) {
    const pixel = image.pixelAt(x, y);
    if (pixel && predicate(pixel)) {
      return x;
    }
  }
  return null;
};

/** 是否是「绿色」—— 用作测试页面里标记物的唯一颜色。 */
export const isGreen = ([r, g, b]) => g > r + 40 && g > b + 40 && g > 120;

/**
 * 找出所有满足条件的像素的外接矩形。
 *
 * 用途：测试页面里放一个**唯一颜色**的标记物，然后让浏览器自己把它画出来，
 * 再从截图里把它的真实位置量出来 —— 这样量到的是浏览器的渲染结果，
 * 而不是我们自己算出来的坐标（自己算自己验 = 白测）。
 */
export const findColorBox = (png, predicate) => {
  const image = decodePng(png);
  if (!image) {
    return null;
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = image.pixelAt(x, y);
      if (!pixel || !predicate(pixel)) {
        continue;
      }
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
};
