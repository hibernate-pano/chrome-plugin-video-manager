/**
 * 设置页面主应用组件
 * 提供 Error Boundary 和全局状态管理
 * @module options/OptionsApp
 */

import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../shared/lib/i18n';
import { OptionsLayout } from './components/OptionsLayout';
import { autoMigrate } from '../shared/utils/migration';

/**
 * Error Boundary State
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary Props
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * Error Boundary 组件
 * 捕获 React 组件树中的错误并显示友好的错误信息
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('设置页面错误:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
              出错了
            </h2>
            <p className="text-gray-600 text-center mb-4">
              设置页面遇到了一个问题，请刷新页面重试。
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-4 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 overflow-auto max-h-40">
                <div className="font-semibold mb-1">错误信息:</div>
                <div>{this.state.error.toString()}</div>
                {this.state.errorInfo && (
                  <>
                    <div className="font-semibold mt-2 mb-1">堆栈跟踪:</div>
                    <div className="whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 设置页面主应用组件
 * 包含 Error Boundary 和页面布局
 */
export function OptionsApp(): React.ReactElement {
  const [isMigrating, setIsMigrating] = useState(true);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // 执行设置迁移和加载语言设置
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 执行自动迁移
        const migrationResult = await autoMigrate();

        if (!migrationResult.success) {
          console.error('设置迁移失败:', migrationResult.error);
          setMigrationError(migrationResult.error || '迁移失败');
        } else if (migrationResult.needsMigration) {
          console.log('设置迁移成功:', migrationResult);
        }

        // 加载语言设置
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.sync.get(['language'], (result) => {
            if (result.language && result.language !== i18n.language) {
              i18n.changeLanguage(result.language);
            }
          });
        }
      } catch (error) {
        console.error('应用初始化失败:', error);
        setMigrationError(error instanceof Error ? error.message : '初始化失败');
      } finally {
        setIsMigrating(false);
      }
    };

    initializeApp();
  }, []);

  // 显示迁移加载状态
  if (isMigrating) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">正在初始化设置...</p>
        </div>
      </div>
    );
  }

  // 显示迁移错误
  if (migrationError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-yellow-100 rounded-full mb-4">
            <svg
              className="w-6 h-6 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
            设置迁移失败
          </h2>
          <p className="text-gray-600 text-center mb-4">
            {migrationError}
          </p>
          <p className="text-sm text-gray-500 text-center mb-4">
            扩展将使用默认设置继续运行。您可以尝试刷新页面重试。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <OptionsLayout />
      </ErrorBoundary>
    </I18nextProvider>
  );
}
