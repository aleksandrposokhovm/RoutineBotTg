import { useState, useEffect, useCallback } from 'react';
import './index.css';
import { SchedulePage } from './pages/SchedulePage';
import { PlanPage } from './pages/PlanPage';
import { DietPage } from './pages/DietPage';
import { FinancePage } from './pages/FinancePage';
import { profileApi, type UserProfile } from './api';

type TabId = 'schedule' | 'plan' | 'diet' | 'finance';

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('schedule');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Определяем пользователя через Telegram WebApp API или fallback для разработки
  useEffect(() => {
    const initUser = async () => {
      try {
        // Попытка получить данные из Telegram WebApp
        const tg = (window as unknown as {
          Telegram?: {
            WebApp?: {
              ready: () => void;
              expand: () => void;
              initDataUnsafe?: {
                user?: {
                  id?: number;
                };
              };
            };
          };
        }).Telegram?.WebApp;
        // Разворачиваем окно, если мы в Telegram
        if (tg?.ready) {
          tg.ready();
          tg.expand();
        }

        const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        try {
          // Вызываем getMe (авторизация идет через заголовок tma, который добавляется в api.ts)
          const profile = await profileApi.getMe();
          setUser(profile);
          setError(null);

          if (profile.timezone !== detectedTz) {
            // Часовой пояс не совпадает — предложить обновить
            if (confirm(`Кажется, вы в другом часовом поясе (${detectedTz}). Перестроить расписание?`)) {
              await profileApi.updateTimezone(detectedTz);
              setUser({ ...profile, timezone: detectedTz });
            }
          }
        } catch (err) {
          setUser(null);
          const errMsg = err instanceof Error ? err.message : String(err);
          setError(errMsg);
        }
      } catch (error) {
        console.error('Init error:', error);
      } finally {
        setLoading(false);
      }
    };

    initUser();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    try {
      const updated = await profileApi.getMe();
      setUser(updated);
      setError(null);
    } catch (e) {
      console.error('Error refreshing user:', e);
      const errMsg = e instanceof Error ? e.message : String(e);
      setError(errMsg);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state animate-fade-in">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-title">Загрузка...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state animate-fade-in">
          <div className="empty-state-icon">🤖</div>
          <div className="empty-state-title">Добро пожаловать в RoutineBot!</div>
          <div className="empty-state-text">
            Отправьте команду /start боту в Telegram,<br />
            чтобы начать работу.
          </div>
          {error && (
            <div className="error-box animate-fade-in" style={{ 
              marginTop: '15px', 
              padding: '12px', 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.25)', 
              borderRadius: '12px',
              fontSize: '13px',
              color: '#f87171',
              wordBreak: 'break-all',
              textAlign: 'left',
              width: '100%',
              maxWidth: '300px'
            }}>
              <strong>Детали ошибки:</strong><br />
              <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Основной контент */}
      <div className="app-content animate-fade-in">
        {activeTab === 'schedule' && <SchedulePage />}
        {activeTab === 'plan' && <PlanPage />}
        {activeTab === 'diet' && (
          <DietPage
            nutritionProfile={user.nutritionProfile}
            onProfileUpdated={refreshUser}
          />
        )}
        {activeTab === 'finance' && <FinancePage />}
      </div>

      {/* Нижняя навигация */}
      <nav className="nav-bar">
        <button
          id="nav-schedule"
          className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          <span className="nav-icon">📅</span>
          <span className="nav-label">Расписание</span>
        </button>
        <button
          id="nav-plan"
          className={`nav-item ${activeTab === 'plan' ? 'active' : ''}`}
          onClick={() => setActiveTab('plan')}
        >
          <span className="nav-icon">📋</span>
          <span className="nav-label">План</span>
        </button>
        <button
          id="nav-diet"
          className={`nav-item ${activeTab === 'diet' ? 'active' : ''}`}
          onClick={() => setActiveTab('diet')}
        >
          <span className="nav-icon">🍽</span>
          <span className="nav-label">Рацион</span>
        </button>
        <button
          id="nav-finance"
          className={`nav-item ${activeTab === 'finance' ? 'active' : ''}`}
          onClick={() => setActiveTab('finance')}
        >
          <span className="nav-icon">💰</span>
          <span className="nav-label">Финансы</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
