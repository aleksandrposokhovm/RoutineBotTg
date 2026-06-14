import { useState } from 'react';
import { type DietEntryItem, API_BASE } from '../api';

interface EditDietViewProps {
  entry: DietEntryItem;
  onClose: () => void;
  onSave: (data: Partial<DietEntryItem>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function EditDietView({ entry, onClose, onSave, onDelete }: EditDietViewProps) {
  const [name, setName] = useState(entry.name);
  const [mealType, setMealType] = useState(entry.mealType || 'snack');
  const [calories, setCalories] = useState(entry.calories.toString());
  const [protein, setProtein] = useState(entry.protein.toString());
  const [fat, setFat] = useState(entry.fat.toString());
  const [carbs, setCarbs] = useState(entry.carbs.toString());
  const [portionGrams, setPortionGrams] = useState(entry.portionGrams ? entry.portionGrams.toString() : '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setPhotoPreview(dataUrl);
          setPhotoData(dataUrl);
        } else {
          setPhotoPreview(event.target?.result as string);
          setPhotoData(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Пожалуйста, введите название блюда');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name,
        mealType,
        calories: parseFloat(calories) || 0,
        protein: parseFloat(protein) || 0,
        fat: parseFloat(fat) || 0,
        carbs: parseFloat(carbs) || 0,
        portionGrams: portionGrams ? parseFloat(portionGrams) : null,
        photoData: photoData || undefined,
      });
    } catch (err) {
      console.error('Error saving diet entry:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert('Не удалось сохранить блюдо: ' + errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Точно удалить эту запись о питании?')) {
      try {
        await onDelete();
      } catch (err) {
        console.error('Error deleting diet entry:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        alert('Не удалось удалить запись: ' + errMsg);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}>Отмена</button>
        <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>{entry.id === 0 ? 'Добавить еду' : 'Изменить рацион'}</h2>
        <button onClick={handleSave} disabled={saving} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontWeight: 'bold', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}>
          {saving ? '⏳' : 'Сохранить'}
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Название блюда</label>
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Например, Куриная грудка"
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Приём пищи</label>
          <select
            value={mealType}
            onChange={e => setMealType(e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', outline: 'none' }}
          >
            <option value="breakfast">🌅 Завтрак</option>
            <option value="lunch">☀️ Обед</option>
            <option value="dinner">🌙 Ужин</option>
            <option value="snack">🍪 Перекус</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Фото блюда</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {(photoPreview || entry.photoFileId) ? (
              <img 
                src={photoPreview || `${API_BASE}/diet/photo/${entry.photoFileId}`} 
                alt="Превью" 
                style={{ width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
              />
            ) : (
              <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'var(--text-disabled)', border: '1.5px dashed var(--border-color-strong)' }}>
                🍽
              </div>
            )}
            <div style={{ flex: 1 }}>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                id="diet-photo-input"
                style={{ display: 'none' }}
              />
              <label 
                htmlFor="diet-photo-input"
                className="btn btn-sm btn-outline"
                style={{ cursor: 'pointer', display: 'inline-block' }}
              >
                📸 Выбрать фото
              </label>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-disabled)', marginTop: '4px', margin: 0 }}>
                Выберите изображение с вашего устройства
              </p>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Порция (грамм)</label>
          <input 
            type="number" 
            value={portionGrams} 
            onChange={e => setPortionGrams(e.target.value)} 
            placeholder="Например, 150"
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Калории</label>
            <input 
              type="number" 
              value={calories} 
              onChange={e => setCalories(e.target.value)} 
              placeholder="0"
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Белки (г)</label>
            <input 
              type="number" 
              value={protein} 
              onChange={e => setProtein(e.target.value)} 
              placeholder="0"
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Жиры (г)</label>
            <input 
              type="number" 
              value={fat} 
              onChange={e => setFat(e.target.value)} 
              placeholder="0"
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>Углеводы (г)</label>
            <input 
              type="number" 
              value={carbs} 
              onChange={e => setCarbs(e.target.value)} 
              placeholder="0"
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        
        {entry.id !== 0 && (
          <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
            <button 
              onClick={handleDelete}
              style={{ width: '100%', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: 'var(--font-size-md)', cursor: 'pointer' }}
            >
              Удалить запись
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
