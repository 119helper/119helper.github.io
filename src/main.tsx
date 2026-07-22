import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TimerProvider } from './contexts/TimerContext'
import { UserProfileProvider } from './contexts/UserProfileContext'
import { FeedbackProvider } from './contexts/FeedbackContext'
import ErrorBoundary from './components/ErrorBoundary'
import ConnectivityStatus from './components/ConnectivityStatus'
import { installGlobalErrorReporting } from './services/telemetry'

installGlobalErrorReporting();

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('Root element #root not found');
}

if (window.self !== window.top) {
  const message = document.createElement('div');
  message.style.padding = '24px';
  message.style.fontFamily = 'system-ui,sans-serif';
  message.textContent = '보안 정책상 119 Helper는 다른 사이트의 프레임 안에서 실행할 수 없습니다.';
  rootEl.replaceChildren(message);
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary
        fallbackTitle="119 Helper 실행 오류"
        fallbackDescription="앱 초기화 중 오류가 발생했습니다. 새로고침 후에도 반복되면 최근 변경 사항을 확인하세요."
      >
        <UserProfileProvider>
          <FeedbackProvider>
            <TimerProvider>
              <App />
            </TimerProvider>
          </FeedbackProvider>
        </UserProfileProvider>
      </ErrorBoundary>
      <ConnectivityStatus />
    </StrictMode>,
  )
}
