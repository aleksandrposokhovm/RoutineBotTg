import { useState, useEffect } from 'react';
import {
  formatDate, getMonthName, getMonthGrid, getWeekDays, getWeekdays,
  isToday, addDays, formatDateHuman, parseDate
} from '../utils/dates';

type ViewMode = 'month' | 'week' | 'day';

interface CalendarProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  datesWithData?: Set<string>;
}

export function CalendarNav({ selectedDate, onDateSelect, datesWithData }: CalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const parsedDate = parseDate(selectedDate);
  const [viewYear, setViewYear] = useState(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedDate.getMonth());

  useEffect(() => {
    const parsed = parseDate(selectedDate);
    setViewYear(parsed.getFullYear());
    setViewMonth(parsed.getMonth());
  }, [selectedDate]);

  const weekdays = getWeekdays();

  const goToPrev = () => {
    if (viewMode === 'month') {
      if (viewMonth === 0) {
        setViewMonth(11);
        setViewYear(viewYear - 1);
      } else {
        setViewMonth(viewMonth - 1);
      }
    } else if (viewMode === 'week') {
      const newDate = addDays(parsedDate, -7);
      onDateSelect(formatDate(newDate));
      setViewMonth(newDate.getMonth());
      setViewYear(newDate.getFullYear());
    } else {
      const newDate = addDays(parsedDate, -1);
      onDateSelect(formatDate(newDate));
      setViewMonth(newDate.getMonth());
      setViewYear(newDate.getFullYear());
    }
  };

  const goToNext = () => {
    if (viewMode === 'month') {
      if (viewMonth === 11) {
        setViewMonth(0);
        setViewYear(viewYear + 1);
      } else {
        setViewMonth(viewMonth + 1);
      }
    } else if (viewMode === 'week') {
      const newDate = addDays(parsedDate, 7);
      onDateSelect(formatDate(newDate));
      setViewMonth(newDate.getMonth());
      setViewYear(newDate.getFullYear());
    } else {
      const newDate = addDays(parsedDate, 1);
      onDateSelect(formatDate(newDate));
      setViewMonth(newDate.getMonth());
      setViewYear(newDate.getFullYear());
    }
  };

  const goToToday = () => {
    const today = new Date();
    onDateSelect(formatDate(today));
    setViewMonth(today.getMonth());
    setViewYear(today.getFullYear());
  };

  const getTitle = () => {
    if (viewMode === 'month') {
      return `${getMonthName(viewMonth)} ${viewYear}`;
    } else if (viewMode === 'week') {
      const week = getWeekDays(parsedDate);
      const start = week[0].date;
      const end = week[6].date;
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()}–${end.getDate()} ${getMonthName(start.getMonth())}`;
      }
      return `${start.getDate()} ${getMonthName(start.getMonth()).slice(0, 3)} – ${end.getDate()} ${getMonthName(end.getMonth()).slice(0, 3)}`;
    } else {
      return formatDateHuman(selectedDate);
    }
  };

  const monthGrid = getMonthGrid(viewYear, viewMonth);
  const weekDays = getWeekDays(parsedDate);

  return (
    <div className="animate-fade-in">
      {/* View Switcher */}
      <div className="view-switcher">
        <button
          className={`view-switcher-btn ${viewMode === 'month' ? 'active' : ''}`}
          onClick={() => setViewMode('month')}
        >
          Месяц
        </button>
        <button
          className={`view-switcher-btn ${viewMode === 'week' ? 'active' : ''}`}
          onClick={() => setViewMode('week')}
        >
          Неделя
        </button>
        <button
          className={`view-switcher-btn ${viewMode === 'day' ? 'active' : ''}`}
          onClick={() => setViewMode('day')}
        >
          День
        </button>
      </div>

      {/* Navigation */}
      <div className="calendar-nav">
        <button className="calendar-nav-btn" onClick={goToPrev}>‹</button>
        <span className="calendar-nav-title" onClick={goToToday}>
          {getTitle()}
        </span>
        <button className="calendar-nav-btn" onClick={goToNext}>›</button>
      </div>

      {/* Month View */}
      {viewMode === 'month' && (
        <div className="month-grid">
          {weekdays.map(wd => (
            <div key={wd} className="month-grid-header">{wd}</div>
          ))}
          {monthGrid.map(({ dateStr, isCurrentMonth }) => {
            const day = parseInt(dateStr.split('-')[2], 10);
            const hasData = datesWithData?.has(dateStr);
            const classes = [
              'month-day',
              !isCurrentMonth && 'other-month',
              isToday(dateStr) && 'today',
              dateStr === selectedDate && 'selected',
              hasData && 'has-events',
            ].filter(Boolean).join(' ');

            return (
              <div
                key={dateStr}
                className={classes}
                onClick={() => {
                  onDateSelect(dateStr);
                  setViewMode('day');
                }}
              >
                {day}
              </div>
            );
          })}
        </div>
      )}

      {/* Week View */}
      {viewMode === 'week' && (
        <div className="week-grid">
          {weekDays.map(({ date, dateStr }, i) => {
            const hasData = datesWithData?.has(dateStr);
            const classes = [
              'week-day-number',
              isToday(dateStr) && 'today',
              dateStr === selectedDate && 'selected',
              hasData && 'has-events',
            ].filter(Boolean).join(' ');

            return (
              <div key={dateStr} className="week-day-col">
                <div className="week-day-label">{weekdays[i]}</div>
                <div
                  className={classes}
                  onClick={() => {
                    onDateSelect(dateStr);
                    setViewMode('day');
                  }}
                >
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
