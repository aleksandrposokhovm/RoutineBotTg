import { useState } from 'react';
import type { PlanItem } from '../api';

interface EditPlanViewProps {
  plan: PlanItem;
  onClose: () => void;
  onSave: (data: Partial<PlanItem>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function EditPlanView({ plan, onClose, onSave, onDelete }: EditPlanViewProps) {
  const [title, setTitle] = useState(plan.title);
  const [description, setDescription] = useState(plan.description || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Пожалуйста, введите название задачи');
      return;
    }
    setSaving(true);
    try {
      await onSave({ title, description: description || null });
    } catch (err) {
      console.error('Error saving plan:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert('Не удалось сохранить задачу: ' + errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Точно удалить эту задачу?')) {
      try {
        await onDelete();
      } catch (err) {
        console.error('Error deleting plan:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        alert('Не удалось удалить задачу: ' + errMsg);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}>Отмена</button>
        <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>{plan.id === 0 ? 'Добавить задачу' : 'Изменить задачу'}</h2>
        <button onClick={handleSave} disabled={saving} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontWeight: 'bold', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}>
          {saving ? '⏳' : 'Сохранить'}
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Задача</label>
          <input 
            type="text" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            placeholder="Например, Сходить на тренировку"
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Описание (опционально)</label>
          <textarea 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Детали задачи..."
            rows={4}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', resize: 'none' }}
          />
        </div>
        
        {plan.id !== 0 && (
          <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
            <button 
              onClick={handleDelete}
              style={{ width: '100%', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}
            >
              Удалить задачу
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
