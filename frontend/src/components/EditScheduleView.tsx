import { useState } from 'react';
import type { ScheduleEvent } from '../api';

interface EditScheduleViewProps {
  event: ScheduleEvent;
  onClose: () => void;
  onSave: (data: Partial<ScheduleEvent>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function EditScheduleView({ event, onClose, onSave, onDelete }: EditScheduleViewProps) {
  const [title, setTitle] = useState(event.title);
  const [startTime, setStartTime] = useState(event.startTime);
  const [endTime, setEndTime] = useState(event.endTime);
  const [description, setDescription] = useState(event.description || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Пожалуйста, введите название события');
      return;
    }
    setSaving(true);
    try {
      await onSave({ title, startTime, endTime, description: description || null, date: event.date });
    } catch (err) {
      console.error('Error saving event:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert('Не удалось сохранить событие: ' + errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Точно удалить это событие?')) {
      try {
        await onDelete();
      } catch (err) {
        console.error('Error deleting event:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        alert('Не удалось удалить событие: ' + errMsg);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}>Отмена</button>
        <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>{event.id === 0 ? 'Добавить событие' : 'Изменить событие'}</h2>
        <button onClick={handleSave} disabled={saving} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontWeight: 'bold', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}>
          {saving ? '⏳' : 'Сохранить'}
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Название</label>
          <input 
            type="text" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            placeholder="Например, Тренировка в зале"
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Начало</label>
            <input 
              type="time" 
              value={startTime} 
              onChange={e => setStartTime(e.target.value)} 
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Конец</label>
            <input 
              type="time" 
              value={endTime} 
              onChange={e => setEndTime(e.target.value)} 
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Описание (опционально)</label>
          <textarea 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Детали события..."
            rows={4}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', resize: 'none', fontFamily: 'inherit' }}
          />
        </div>
        
        {event.id !== 0 && (
          <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
            <button 
              onClick={handleDelete}
              style={{ width: '100%', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}
            >
              Удалить событие
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
