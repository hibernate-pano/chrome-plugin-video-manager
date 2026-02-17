import type { Config } from 'tailwindcss';

const config: Config = {
  // 内容路径配置 - 指定需要扫描的文件
  content: [
    './options.html',
    './options/**/*.{ts,tsx}',
    './content/**/*.{ts,tsx}',
    './background/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
  ],

  // 暗色模式配置
  darkMode: ['class', 'class'],

  // 优化配置
  future: {
    // 启用未来的优化特性
    hoverOnlyWhenSupported: true, // 仅在支持 hover 的设备上启用 hover 样式
  },

  // 实验性功能
  experimental: {
    optimizeUniversalDefaults: true, // 优化通用默认值
  },

  theme: {
  	extend: {
  		colors: {
  			primary: {
  				'50': '#f0f9ff',
  				'100': '#e0f2fe',
  				'200': '#bae6fd',
  				'300': '#7dd3fc',
  				'400': '#38bdf8',
  				'500': '#0ea5e9',
  				'600': '#0284c7',
  				'700': '#0369a1',
  				'800': '#075985',
  				'900': '#0c4a6e',
  				'950': '#082f49',
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			hud: {
  				bg: 'rgba(0, 0, 0, 0.85)',
  				text: '#ffffff',
  				speed: '#38bdf8',
  				volume: '#10b981',
  				seek: '#f59e0b',
  				reset: '#ef4444'
  			},
  			extension: {
  				bg: '#ffffff',
  				'bg-dark': '#1a1a1a',
  				border: '#e5e7eb',
  				'border-dark': '#374151'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		fontFamily: {
  			sans: [
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'Roboto',
  				'Helvetica Neue',
  				'Arial',
  				'sans-serif'
  			],
  			mono: [
  				'SF Mono',
  				'Monaco',
  				'Inconsolata',
  				'Fira Code',
  				'Droid Sans Mono',
  				'monospace'
  			]
  		},
  		animation: {
  			// 基础淡入淡出动画
  			'fade-in': 'fadeIn 0.2s ease-out',
  			'fade-out': 'fadeOut 0.2s ease-in',
  			'fade-in-slow': 'fadeIn 0.4s ease-out',
  			'fade-out-slow': 'fadeOut 0.4s ease-in',
  			'fade-in-fast': 'fadeIn 0.1s ease-out',
  			'fade-out-fast': 'fadeOut 0.1s ease-in',

  			// 滑动动画
  			'slide-up': 'slideUp 0.3s ease-out',
  			'slide-down': 'slideDown 0.3s ease-out',
  			'slide-up-fade': 'slideUpFade 0.3s ease-out',
  			'slide-down-fade': 'slideDownFade 0.3s ease-out',

  			// 缩放动画
  			'scale-in': 'scaleIn 0.2s ease-out',
  			'scale-out': 'scaleOut 0.2s ease-in',
  			'bounce-in': 'bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',

  			// 特殊动画
  			'number-roll': 'numberRoll 0.3s ease-out',
  			'zoom-in': 'zoomIn 0.3s ease-out',
  			'zoom-out': 'zoomOut 0.3s ease-in',

  			// 控制条动画
  			'controls-fade-in': 'controlsFadeIn 0.3s ease-out',
  			'controls-fade-out': 'controlsFadeOut 0.3s ease-in',
  			'controls-slide-up': 'controlsSlideUp 0.3s ease-out',

  			// HUD 动画
  			'hud-appear': 'hudAppear 0.2s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  			'hud-disappear': 'hudDisappear 0.2s ease-in',

  			// 脉冲和闪烁
  			'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
  			'glow': 'glow 1.5s ease-in-out infinite',

  			// 滑动进入动画
  			'slide-in-left': 'slideInLeft 0.3s ease-out',
  			'slide-in-right': 'slideInRight 0.3s ease-out',
  		},
  		keyframes: {
  			// 基础淡入淡出
  			fadeIn: {
  				'0%': {
  					opacity: '0'
  				},
  				'100%': {
  					opacity: '1'
  				}
  			},
  			fadeOut: {
  				'0%': {
  					opacity: '1'
  				},
  				'100%': {
  					opacity: '0'
  				}
  			},

  			// 滑动动画
  			slideUp: {
  				'0%': {
  					transform: 'translateY(10px)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateY(0)',
  					opacity: '1'
  				}
  			},
  			slideDown: {
  				'0%': {
  					transform: 'translateY(-10px)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateY(0)',
  					opacity: '1'
  				}
  			},
  			slideUpFade: {
  				'0%': {
  					transform: 'translateY(20px)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateY(0)',
  					opacity: '1'
  				}
  			},
  			slideDownFade: {
  				'0%': {
  					transform: 'translateY(-20px)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateY(0)',
  					opacity: '1'
  				}
  			},

  			// 缩放动画
  			scaleIn: {
  				'0%': {
  					transform: 'scale(0.95)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				}
  			},
  			scaleOut: {
  				'0%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				},
  				'100%': {
  					transform: 'scale(0.95)',
  					opacity: '0'
  				}
  			},
  			bounceIn: {
  				'0%': {
  					transform: 'scale(0.3)',
  					opacity: '0'
  				},
  				'50%': {
  					transform: 'scale(1.05)'
  				},
  				'70%': {
  					transform: 'scale(0.9)'
  				},
  				'100%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				}
  			},

  			// 特殊动画
  			numberRoll: {
  				'0%': {
  					transform: 'translateY(-20%)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateY(0)',
  					opacity: '1'
  				}
  			},
  			zoomIn: {
  				'0%': {
  					transform: 'scale(0.8)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				}
  			},
  			zoomOut: {
  				'0%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				},
  				'100%': {
  					transform: 'scale(0.8)',
  					opacity: '0'
  				}
  			},

  			// 控制条动画
  			controlsFadeIn: {
  				'0%': {
  					opacity: '0',
  					transform: 'translateY(20px)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			controlsFadeOut: {
  				'0%': {
  					opacity: '1',
  					transform: 'translateY(0)'
  				},
  				'100%': {
  					opacity: '0',
  					transform: 'translateY(20px)'
  				}
  			},
  			controlsSlideUp: {
  				'0%': {
  					opacity: '0',
  					transform: 'translateY(100%)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},

  			// HUD 动画
  			hudAppear: {
  				'0%': {
  					opacity: '0',
  					transform: 'scale(0.8) translateY(-10px)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'scale(1) translateY(0)'
  				}
  			},
  			hudDisappear: {
  				'0%': {
  					opacity: '1',
  					transform: 'scale(1) translateY(0)'
  				},
  				'100%': {
  					opacity: '0',
  					transform: 'scale(0.8) translateY(-10px)'
  				}
  			},

  			// 脉冲和闪烁
  			pulseSubtle: {
  				'0%, 100%': {
  					opacity: '1'
  				},
  				'50%': {
  					opacity: '0.8'
  				}
  			},
  			glow: {
  				'0%, 100%': {
  					boxShadow: '0 0 5px rgba(59, 130, 246, 0.5)'
  				},
  				'50%': {
  					boxShadow: '0 0 20px rgba(59, 130, 246, 0.8)'
  				}
  			},

  			// 滑动进入动画
  			slideInLeft: {
  				'0%': {
  					transform: 'translateX(-30px) scale(0.5)',
  					opacity: '0'
  				},
  				'70%': {
  					transform: 'translateX(5px) scale(1.05)',
  					opacity: '1'
  				},
  				'100%': {
  					transform: 'translateX(0) scale(1)',
  					opacity: '1'
  				}
  			},
  			slideInRight: {
  				'0%': {
  					transform: 'translateX(30px) scale(0.5)',
  					opacity: '0'
  				},
  				'70%': {
  					transform: 'translateX(-5px) scale(1.05)',
  					opacity: '1'
  				},
  				'100%': {
  					transform: 'translateX(0) scale(1)',
  					opacity: '1'
  				}
  			}
  		},
  		transitionDuration: {
  			'0': '0ms',
  			'50': '50ms',
  			'100': '100ms',
  			'150': '150ms',
  			'200': '200ms',
  			'250': '250ms',
  			'300': '300ms',
  			'400': '400ms',
  			'500': '500ms',
  			'600': '600ms',
  			'700': '700ms',
  			'800': '800ms',
  			'900': '900ms',
  			'1000': '1000ms'
  		},
  		transitionTimingFunction: {
  			spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  			'ease-in-out-back': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
  		},
  		boxShadow: {
  			hud: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
  			modal: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
  		},
  		borderRadius: {
  			hud: '12px',
  			modal: '16px',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		zIndex: {
  			hud: '999999',
  			lightbox: '999998',
  			modal: '999997'
  		}
  	}
  },

  plugins: [
      require("tailwindcss-animate")
  ],
};

export default config;
