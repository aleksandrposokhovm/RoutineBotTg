import { useState, useEffect, useCallback } from 'react';
import { CalendarNav } from '../components/CalendarNav';
import { KBJUChart } from '../components/KBJUChart';
import { ConfirmModal } from '../components/ConfirmModal';
import { dietApi, profileApi, type DietEntryItem, type DietSummary, type NutritionProfile, API_BASE } from '../api';
import { formatDate, formatDateHuman } from '../utils/dates';
import { EditDietView } from '../components/EditDietView';

interface DietPageProps {
  nutritionProfile: NutritionProfile | null;
  onProfileUpdated: () => void;
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: '🌅 Завтрак',
  lunch: '☀️ Обед',
  dinner: '🌙 Ужин',
  snack: '🍪 Перекус',
};

export function DietPage({ nutritionProfile, onProfileUpdated }: DietPageProps) {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [entries, setEntries] = useState<DietEntryItem[]>([]);
  const [summary, setSummary] = useState<DietSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [allDietDates, setAllDietDates] = useState<Set<string>>(new Set());
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingDiet, setEditingDiet] = useState<DietEntryItem | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: number; name: string }>({
    isOpen: false, id: 0, name: ''
  });

  // Форма КБЖУ профиля
  const [profileForm, setProfileForm] = useState({
    height: nutritionProfile?.height || '',
    weight: nutritionProfile?.weight || '',
    age: nutritionProfile?.age || '',
    gender: nutritionProfile?.gender || 'male',
    activityLevel: nutritionProfile?.activityLevel || 'moderate',
    goal: nutritionProfile?.goal || 'maintain',
  });
  const [calculating, setCalculating] = useState(false);

  // Синхронизация формы при загрузке профиля
  useEffect(() => {
    if (nutritionProfile) {
      setProfileForm({
        height: nutritionProfile.height,
        weight: nutritionProfile.weight,
        age: nutritionProfile.age,
        gender: nutritionProfile.gender,
        activityLevel: nutritionProfile.activityLevel,
        goal: nutritionProfile.goal,
      });
    }
  }, [nutritionProfile]);

  const loadData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [entriesData, summaryData] = await Promise.all([
        dietApi.getByDate(date),
        dietApi.getSummary(date),
      ]);
      setEntries(entriesData);
      setSummary(summaryData);
    } catch (e) {
      console.error('Error loading diet data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllDietDates = useCallback(async () => {
    try {
      const data = await dietApi.getByDate();
      setAllDietDates(new Set(data.map((d: DietEntryItem) => d.date)));
    } catch (e) {
      console.error('Error loading all diet dates:', e);
    }
  }, []);

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate, loadData]);

  useEffect(() => {
    loadAllDietDates();
  }, [loadAllDietDates]);

  const handleDeleteEntry = async () => {
    try {
      await dietApi.delete(deleteModal.id);
      setDeleteModal({ isOpen: false, id: 0, name: '' });
      loadData(selectedDate);
      loadAllDietDates();
    } catch (e) {
      console.error('Error deleting diet entry:', e);
    }
  };

  const handleCalculateProfile = async () => {
    if (!profileForm.height || !profileForm.weight || !profileForm.age) return;

    setCalculating(true);
    try {
      await profileApi.calculateNutrition({
        height: Number(profileForm.height),
        weight: Number(profileForm.weight),
        age: Number(profileForm.age),
        gender: profileForm.gender,
        activityLevel: profileForm.activityLevel,
        goal: profileForm.goal,
      });
      setShowProfileForm(false);
      onProfileUpdated();
      loadData(selectedDate);
    } catch (e) {
      console.error('Error calculating KBJU:', e);
    } finally {
      setCalculating(false);
    }
  };

  // Группировка по типу приема пищи
  const groupedEntries = entries.reduce((acc, entry) => {
    if (!acc[entry.mealType]) acc[entry.mealType] = [];
    acc[entry.mealType].push(entry);
    return acc;
  }, {} as Record<string, DietEntryItem[]>);

  if (editingDiet) {
    return (
      <EditDietView 
        entry={editingDiet}
        onClose={() => setEditingDiet(null)}
        onSave={async (data) => {
          if (editingDiet.id === 0) {
            await dietApi.create({
              name: data.name || '',
              mealType: data.mealType || 'snack',
              date: selectedDate,
              calories: data.calories || 0,
              protein: data.protein || 0,
              fat: data.fat || 0,
              carbs: data.carbs || 0,
              portionGrams: data.portionGrams || null,
              photoFileId: null,
              photoData: data.photoData
            });
          } else {
            await dietApi.update(editingDiet.id, data);
          }
          setEditingDiet(null);
          loadData(selectedDate);
          loadAllDietDates();
        }}
        onDelete={async () => {
          await dietApi.delete(editingDiet.id);
          setEditingDiet(null);
          loadData(selectedDate);
          loadAllDietDates();
        }}
      />
    );
  }

  const handleCreateDietEntry = () => {
    setEditingDiet({
      id: 0,
      name: '',
      mealType: 'snack',
      date: selectedDate,
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      portionGrams: null,
      photoFileId: null
    });
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="page-title">🍽 Рацион</h1>
            <p className="page-subtitle">Дневник питания и КБЖУ</p>
          </div>
          <div className="flex gap-8">
            <button
              className="btn btn-sm btn-primary"
              onClick={handleCreateDietEntry}
            >
              ➕ Добавить
            </button>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setShowProfileForm(!showProfileForm)}
            >
              {nutritionProfile ? '⚙️ КБЖУ' : '📊 Рассчитать'}
            </button>
          </div>
        </div>
      </div>

      {/* Форма расчета КБЖУ */}
      {showProfileForm && (
        <div className="card mb-16 animate-slide-up">
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 16 }}>
            📊 Рассчитать суточную норму КБЖУ
          </h3>

          <div className="form-group">
            <label className="form-label">Рост (см)</label>
            <input
              type="number"
              className="form-input"
              placeholder="175"
              value={profileForm.height}
              onChange={e => setProfileForm({ ...profileForm, height: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Вес (кг)</label>
            <input
              type="number"
              className="form-input"
              placeholder="75"
              value={profileForm.weight}
              onChange={e => setProfileForm({ ...profileForm, weight: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Возраст</label>
            <input
              type="number"
              className="form-input"
              placeholder="25"
              value={profileForm.age}
              onChange={e => setProfileForm({ ...profileForm, age: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Пол</label>
            <select
              className="form-select"
              value={profileForm.gender}
              onChange={e => setProfileForm({ ...profileForm, gender: e.target.value })}
            >
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Уровень активности</label>
            <select
              className="form-select"
              value={profileForm.activityLevel}
              onChange={e => setProfileForm({ ...profileForm, activityLevel: e.target.value })}
            >
              <option value="sedentary">Сидячий образ жизни</option>
              <option value="light">Лёгкая активность (1-2 тр./нед.)</option>
              <option value="moderate">Умеренная (3-4 тр./нед.)</option>
              <option value="active">Высокая (5-6 тр./нед.)</option>
              <option value="very_active">Очень высокая (ежедневно)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Цель</label>
            <select
              className="form-select"
              value={profileForm.goal}
              onChange={e => setProfileForm({ ...profileForm, goal: e.target.value })}
            >
              <option value="lose">Похудение</option>
              <option value="maintain">Поддержание веса</option>
              <option value="gain">Набор массы</option>
            </select>
          </div>

          <button
            className="btn btn-primary btn-block"
            onClick={handleCalculateProfile}
            disabled={calculating}
          >
            {calculating ? '⏳ ИИ рассчитывает...' : '🧠 Рассчитать через ИИ'}
          </button>
        </div>
      )}

      <CalendarNav
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        datesWithData={allDietDates}
      />

      {/* KBJU Chart */}
      {summary && (
        <KBJUChart
          eaten={summary.eaten}
          goals={summary.goals}
        />
      )}

      {/* Diet Entries */}
      <div style={{ marginTop: 8 }}>
        <div className="flex justify-between items-center mb-8">
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
            {formatDateHuman(selectedDate)}
          </h2>
          {entries.length > 0 && (
            <span className="todo-badge">{entries.length} приёмов</span>
          )}
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
          </div>
        ) : (
          <>
            {['breakfast', 'lunch', 'dinner', 'snack'].map(mealType => {
              // eslint-disable-next-line security/detect-object-injection
              const mealEntries = groupedEntries[mealType];
              if (!mealEntries || mealEntries.length === 0) return null;

              return (
                <div key={mealType} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                  }}>
                    {/* eslint-disable-next-line security/detect-object-injection */}
                    {MEAL_TYPE_LABELS[mealType] || mealType}
                  </div>

                  {mealEntries.map(entry => (
                    <div key={entry.id} className="diet-entry" onClick={() => setEditingDiet(entry)}>
                      {entry.photoFileId && (
                        <img 
                          src={`${API_BASE}/diet/photo/${entry.photoFileId}`} 
                          alt={entry.name} 
                          className="diet-entry-photo"
                        />
                      )}
                      <div className="diet-entry-info">
                        <div className="diet-entry-name">{entry.name}</div>
                        <div className="diet-entry-macros">
                          <span className="diet-entry-macro">
                            <span className="macro-dot calories"></span>
                            {Math.round(entry.calories)} ккал
                          </span>
                          <span className="diet-entry-macro">
                            <span className="macro-dot protein"></span>
                            Б: {Math.round(entry.protein)}г
                          </span>
                          <span className="diet-entry-macro">
                            <span className="macro-dot fat"></span>
                            Ж: {Math.round(entry.fat)}г
                          </span>
                          <span className="diet-entry-macro">
                            <span className="macro-dot carbs"></span>
                            У: {Math.round(entry.carbs)}г
                          </span>
                        </div>
                        {entry.portionGrams && (
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-disabled)', marginTop: 4 }}>
                            ⚖️ {entry.portionGrams}г
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}

        {!loading && entries.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🍽</div>
            <div className="empty-state-title">Нет записей</div>
            <div className="empty-state-text">
              Отправьте боту фото еды или напишите, что вы ели
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        icon="🗑"
        title="Удалить запись"
        text={`Удалить "${deleteModal.name}" из рациона?`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        onConfirm={handleDeleteEntry}
        onCancel={() => setDeleteModal({ isOpen: false, id: 0, name: '' })}
      />
    </div>
  );
}
