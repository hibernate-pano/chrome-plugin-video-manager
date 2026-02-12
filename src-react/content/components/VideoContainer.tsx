/**
 * VideoContainer 视频容器组件
 * 使用 React Spring 实现炫酷的缩放动画，提供平滑的全屏展开/收缩效果
 * @module content/components/VideoContainer
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useSpring, animated, config } from '@react-spring/web';

/**
 * VideoContainer Props
 */
interface VideoContainerProps {
  /** 媒体元素 */
  media: HTMLMediaElement;
}

/**
 * 获取元素的边界矩形
 * @param element HTML 元素
 * @returns 边界矩形信息
 */
function getElementRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * VideoContainer 组件
 * 实现视频从当前位置到全屏的炫酷缩放动画
 */
export default function VideoContainer({ media }: VideoContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialRect, setInitialRect] = useState<ReturnType<typeof getElementRect> | null>(null);
  const [isAnimating, setIsAnimating] = useState(true);
  const [isEntering, setIsEntering] = useState(true);

  // 获取视频的初始位置和尺寸
  useEffect(() => {
    if (media) {
      const rect = getElementRect(media);
      setInitialRect(rect);
    }
  }, [media]);

  // 计算目标位置（全屏居中）
  const targetRect = useMemo(() => ({
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }), []);

  // 使用 React Spring 创建炫酷的缩放动画
  // 使用更有弹性的配置，创造更生动的效果
  const springConfig = useMemo(() => ({
    tension: 170,
    friction: 26,
    mass: 1,
    clamp: false,  // 允许过冲，创造弹性效果
  }), []);

  const springProps = useSpring({
    from: initialRect
      ? {
          x: initialRect.x,
          y: initialRect.y,
          width: initialRect.width,
          height: initialRect.height,
          opacity: 0.5,
          scale: 0.95,
          rotate: 0,
        }
      : {
          x: targetRect.x,
          y: targetRect.y,
          width: targetRect.width,
          height: targetRect.height,
          opacity: 1,
          scale: 1,
          rotate: 0,
        },
    to: {
      x: targetRect.x,
      y: targetRect.y,
      width: targetRect.width,
      height: targetRect.height,
      opacity: 1,
      scale: 1,
      rotate: 0,
    },
    config: springConfig,
    onRest: () => {
      setIsAnimating(false);
      setIsEntering(false);
    },
  });

  // 添加背景模糊动画
  const backgroundSpring = useSpring({
    from: { blur: 0 },
    to: { blur: 20 },
    config: config.slow,
  });

  // 计算视频的适配尺寸（保持宽高比）
  const calculateFitSize = () => {
    if (!media) {
      return { width: '100%', height: '100%' };
    }

    // 类型断言为 HTMLVideoElement 以访问 videoWidth 和 videoHeight
    const videoElement = media as HTMLVideoElement;
    const videoWidth = videoElement.videoWidth || media.clientWidth;
    const videoHeight = videoElement.videoHeight || media.clientHeight;

    if (!videoWidth || !videoHeight) {
      return { width: '100%', height: '100%' };
    }

    const videoAspectRatio = videoWidth / videoHeight;
    const screenAspectRatio = window.innerWidth / window.innerHeight;

    if (videoAspectRatio > screenAspectRatio) {
      // 视频更宽，以宽度为准
      return {
        width: '100%',
        height: 'auto',
      };
    } else {
      // 视频更高，以高度为准
      return {
        width: 'auto',
        height: '100%',
      };
    }
  };

  const fitSize = useMemo(() => calculateFitSize(), [media]);

  // 添加视频内容的淡入动画
  const contentSpring = useSpring({
    from: { opacity: 0, scale: 0.9 },
    to: { opacity: 1, scale: 1 },
    delay: 200,  // 延迟一点，让容器动画先开始
    config: config.gentle,
  });

  return (
    <>
      {/* 背景模糊层 */}
      <animated.div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          backdropFilter: backgroundSpring.blur.to((b) => `blur(${b}px)`),
          zIndex: -1,
        }}
      />

      {/* 视频容器 */}
      <animated.div
        ref={containerRef}
        className="video-container"
        style={{
          position: 'fixed',
          left: springProps.x,
          top: springProps.y,
          width: springProps.width,
          height: springProps.height,
          opacity: springProps.opacity,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: isAnimating ? 'none' : 'auto',
          transform: springProps.scale.to((s) => `scale(${s})`),
          transformOrigin: 'center center',
        }}
      >
        {/* 视频包装器 */}
        <animated.div
          className="video-wrapper"
          style={{
            width: fitSize.width,
            height: fitSize.height,
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: contentSpring.opacity,
            transform: contentSpring.scale.to((s) => `scale(${s})`),
          }}
        >
          {/* 视频占位符 */}
          <div
            className="video-placeholder"
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'transparent',
              position: 'relative',
            }}
          >
            {/* 添加装饰性的光晕效果 */}
            {isEntering && (
              <animated.div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '120%',
                  height: '120%',
                  background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
                  opacity: contentSpring.opacity.to((o) => 1 - o),
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </animated.div>
      </animated.div>
    </>
  );
}
