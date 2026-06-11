import { useState, useEffect, useCallback } from 'react';
import { CalendarNav } from '../components/CalendarNav';
import { scheduleApi, profileApi, googleAuthApi, type UserProfile } from '../api';
import { formatDate, formatDateHuman } from '../utils/dates';
import { EditScheduleView } from '../components/EditScheduleView';

interface ScheduleEvent {
  id: number;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
}

export function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [allEventsDates, setAllEventsDates] = useState<Set<string>>(new Set());
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const data = await profileApi.getMe();
      setProfile(data);
    } catch (e) {
      console.error('Error loading profile:', e);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const handleVisibilityAndFocus = () => {
      if (document.visibilityState === 'visible') {
        loadProfile();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityAndFocus);
    window.addEventListener('focus', handleVisibilityAndFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityAndFocus);
      window.removeEventListener('focus', handleVisibilityAndFocus);
    };
  }, [loadProfile]);

  const handleConnectCalendar = async () => {
    try {
      const { url } = await googleAuthApi.getAuthUrl();
      const tg = (window as any).Telegram?.WebApp;
      if (tg && tg.openLink) {
        tg.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      console.error('Error getting Google Auth URL:', e);
    }
  };

  const handleDisconnectCalendar = async () => {
    try {
      await googleAuthApi.disconnect();
      await loadProfile();
    } catch (e) {
      console.error('Error disconnecting Google Calendar:', e);
    }
  };

  const loadEvents = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const data = await scheduleApi.getByDate(date);
      setEvents(data);
    } catch (e) {
      console.error('Error loading schedule:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllEventsDates = useCallback(async () => {
    try {
      const data = await scheduleApi.getByDate();
      setAllEventsDates(new Set(data.map((e: { date: string }) => e.date)));
    } catch (e) {
      console.error('Error loading all event dates:', e);
    }
  }, []);

  useEffect(() => {
    loadEvents(selectedDate);
  }, [selectedDate, loadEvents]);

  useEffect(() => {
    loadAllEventsDates();
  }, [loadAllEventsDates]);

  // Вычисление динамического диапазона часов с фильтрацией от NaN
  const BASE_HOURS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0];
  const parsedHours = events
    .map(e => parseInt((e.startTime || '').split(':')[0], 10))
    .filter(h => !isNaN(h));
  
  // Объединяем базовые часы и часы из событий
  const allHours = Array.from(new Set([...BASE_HOURS, ...parsedHours]));

  // Сортировка: день начинается в 2 утра (2:00) и заканчивается в 1:00 следующего дня
  const getHourSortIndex = (h: number) => {
    return h >= 2 ? h - 2 : h + 22;
  };

  const HOURS = allHours.sort((a, b) => getHourSortIndex(a) - getHourSortIndex(b));

  // Группировка событий по часам
  const getEventsForHour = (hour: number) => {
    return events.filter(e => {
      const startHour = parseInt(e.startTime.split(':')[0], 10);
      return startHour === hour;
    });
  };

  const handleDeleteEvent = async (id: number) => {
    try {
      await scheduleApi.delete(id);
      setEditingEvent(null);
      loadEvents(selectedDate);
      loadAllEventsDates();
    } catch (e) {
      console.error('Error deleting event:', e);
    }
  };

  if (editingEvent) {
    return (
      <EditScheduleView 
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={async (data) => {
          if (editingEvent.id === 0) {
            await scheduleApi.create({
              title: data.title || '',
              description: data.description || undefined,
              date: selectedDate,
              startTime: data.startTime || '09:00',
              endTime: data.endTime || '10:00'
            });
          } else {
            await scheduleApi.update(editingEvent.id, data);
          }
          setEditingEvent(null);
          loadEvents(selectedDate);
          loadAllEventsDates();
        }}
        onDelete={() => handleDeleteEvent(editingEvent.id)}
      />
    );
  }

  const handleCreateEvent = (defaultHour?: number) => {
    let startTime = '09:00';
    let endTime = '10:00';

    if (defaultHour !== undefined) {
      startTime = `${String(defaultHour).padStart(2, '0')}:00`;
      endTime = `${String((defaultHour + 1) % 24).padStart(2, '0')}:00`;
    } else {
      const now = new Date();
      const currentHour = now.getHours();
      startTime = `${String(currentHour).padStart(2, '0')}:00`;
      endTime = `${String((currentHour + 1) % 24).padStart(2, '0')}:00`;
    }

    setEditingEvent({
      id: 0,
      title: '',
      description: '',
      date: selectedDate,
      startTime,
      endTime
    });
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="page-title">📅 Расписание</h1>
            <p className="page-subtitle">События с привязкой ко времени</p>
          </div>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => handleCreateEvent()}
          >
            ➕ Добавить
          </button>
        </div>
      </div>

      {/* Google Calendar integration banner */}
      <div className="google-calendar-banner">
        {profile?.isGoogleCalendarConnected ? (
          <div className="google-calendar-status connected">
            <div className="status-info">
              <span className="status-dot" />
              <span>Google Календарь подключен</span>
            </div>
            <button className="btn-disconnect" onClick={handleDisconnectCalendar}>
              Отключить
            </button>
          </div>
        ) : (
          <div className="google-calendar-status disconnected">
            <div className="status-info">
              <span>Синхронизация событий с Google</span>
            </div>
            <button className="btn-connect" onClick={handleConnectCalendar}>
              Подключить
            </button>
          </div>
        )}
      </div>

      <CalendarNav
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        datesWithData={allEventsDates}
      />

      {/* Day Timeline */}
      <div style={{ marginTop: 8 }}>
        <div className="flex justify-between items-center mb-8">
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
            {formatDateHuman(selectedDate)}
          </h2>
          {events.length > 0 && (
            <span className="todo-badge">{events.length} событий</span>
          )}
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
          </div>
        ) : (
          <div className="timeline">
            {HOURS.map(hour => {
              const hourEvents = getEventsForHour(hour);
              const hourStr = String(hour).padStart(2, '0') + ':00';

              return (
                <div
                  key={hour}
                  className="timeline-slot"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleCreateEvent(hour)}
                >
                  <div className="timeline-time">{hourStr}</div>
                  <div className="timeline-content">
                    {hourEvents.map(event => (
                      <div
                        key={event.id}
                        className="timeline-event"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEvent(event);
                        }}
                      >
                        <div className="timeline-event-title">{event.title}</div>
                        <div className="timeline-event-time">
                          {event.startTime} – {event.endTime}
                        </div>
                        {event.description && (
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                            {event.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="empty-state" style={{ paddingTop: 24 }}>
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">Нет событий</div>
            <div className="empty-state-text">
              Отправьте голосовое боту, чтобы добавить события
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
