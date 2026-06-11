import { useState, useEffect, useCallback } from 'react';
import { CalendarNav } from '../components/CalendarNav';
import { ConfirmModal } from '../components/ConfirmModal';
import { plansApi, type PlanItem } from '../api';
import { formatDate, formatDateHuman } from '../utils/dates';
import { EditPlanView } from '../components/EditPlanView';

export function PlanPage() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [allPlansDates, setAllPlansDates] = useState<Set<string>>(new Set());
  const [editingPlan, setEditingPlan] = useState<PlanItem | null>(null);

  // Модальное окно подтверждения
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    planId: number;
    planTitle: string;
    action: 'complete' | 'delete';
  }>({
    isOpen: false,
    planId: 0,
    planTitle: '',
    action: 'complete',
  });

  const loadPlans = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const data = await plansApi.getByDate(date);
      setPlans(data);
    } catch (e) {
      console.error('Error loading plans:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllPlansDates = useCallback(async () => {
    try {
      const data = await plansApi.getByDate();
      setAllPlansDates(new Set(data.map((p: PlanItem) => p.date)));
    } catch (e) {
      console.error('Error loading all plan dates:', e);
    }
  }, []);

  useEffect(() => {
    loadPlans(selectedDate);
  }, [selectedDate, loadPlans]);

  useEffect(() => {
    loadAllPlansDates();
  }, [loadAllPlansDates]);

  const handleCheckboxClick = (plan: PlanItem) => {
    if (plan.completed) {
      // Снять галочку — без подтверждения
      handleUncomplete(plan.id);
    } else {
      // Поставить галочку — с красивым подтверждением
      setConfirmModal({
        isOpen: true,
        planId: plan.id,
        planTitle: plan.title,
        action: 'complete',
      });
    }
  };

  const handleComplete = async () => {
    try {
      await plansApi.complete(confirmModal.planId, selectedDate);
      setConfirmModal({ ...confirmModal, isOpen: false });
      loadPlans(selectedDate);
      loadAllPlansDates();
    } catch (e) {
      console.error('Error completing plan:', e);
    }
  };

  const handleUncomplete = async (id: number) => {
    try {
      await plansApi.uncomplete(id);
      loadPlans(selectedDate);
      loadAllPlansDates();
    } catch (e) {
      console.error('Error uncompleting plan:', e);
    }
  };

  const handleDeleteClick = (plan: PlanItem) => {
    setConfirmModal({
      isOpen: true,
      planId: plan.id,
      planTitle: plan.title,
      action: 'delete',
    });
  };

  const handleDelete = async () => {
    try {
      await plansApi.delete(confirmModal.planId);
      setConfirmModal({ ...confirmModal, isOpen: false });
      loadPlans(selectedDate);
      loadAllPlansDates();
    } catch (e) {
      console.error('Error deleting plan:', e);
    }
  };

  const completedCount = plans.filter(p => p.completed).length;
  const totalCount = plans.length;

  if (editingPlan) {
    return (
      <EditPlanView 
        plan={editingPlan}
        onClose={() => setEditingPlan(null)}
        onSave={async (data) => {
          if (editingPlan.id === 0) {
            await plansApi.create({
              title: data.title || '',
              description: data.description || undefined,
              date: selectedDate
            });
          } else {
            await plansApi.update(editingPlan.id, data);
          }
          setEditingPlan(null);
          loadPlans(selectedDate);
          loadAllPlansDates();
        }}
        onDelete={async () => {
          await plansApi.delete(editingPlan.id);
          setEditingPlan(null);
          loadPlans(selectedDate);
          loadAllPlansDates();
        }}
      />
    );
  }

  const handleCreatePlan = () => {
    setEditingPlan({
      id: 0,
      title: '',
      description: '',
      date: selectedDate,
      completed: false,
      completedAt: null,
      originalDate: selectedDate,
      isCarriedOver: false
    });
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="page-title">📋 План</h1>
            <p className="page-subtitle">Задачи на день (To-Do)</p>
          </div>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleCreatePlan}
          >
            ➕ Добавить
          </button>
        </div>
      </div>

      <CalendarNav
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        datesWithData={allPlansDates}
      />

      {/* Plan Content */}
      <div style={{ marginTop: 8 }}>
        <div className="flex justify-between items-center mb-8">
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
            {formatDateHuman(selectedDate)}
          </h2>
          {totalCount > 0 && (
            <span className="todo-badge">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div style={{
            height: 4,
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-full)',
            marginBottom: 16,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${(completedCount / totalCount) * 100}%`,
              background: 'var(--color-success)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        )}

        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
          </div>
        ) : (
          <div className="todo-list">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`todo-item ${plan.completed ? 'completed' : ''} ${plan.isCarriedOver ? 'carried-over' : ''}`}
              >
                <div
                  className={`todo-checkbox ${plan.completed ? 'checked' : ''}`}
                  onClick={() => handleCheckboxClick(plan)}
                >
                  {plan.completed && '✓'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => setEditingPlan(plan)}>
                  <div className="todo-title">{plan.title}</div>
                  {plan.isCarriedOver && (
                    <div style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-warning)',
                      marginTop: 2,
                    }}>
                      ⏳ Перенесено с {plan.originalDate.split('-').reverse().join('.')}
                    </div>
                  )}
                  {plan.description && (
                    <div style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-muted)',
                      marginTop: 2,
                    }}>
                      {plan.description}
                    </div>
                  )}
                </div>
                <button
                  className="calendar-nav-btn"
                  style={{ width: 28, height: 28, fontSize: 12 }}
                  onClick={() => handleDeleteClick(plan)}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && plans.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">Нет задач</div>
            <div className="empty-state-text">
              Надиктуйте боту свои планы на день
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно подтверждения */}
      <ConfirmModal
        isOpen={confirmModal.isOpen && confirmModal.action === 'complete'}
        icon="🎯"
        title="Подтвердить выполнение"
        text={`Отметить задачу "${confirmModal.planTitle}" как выполненную?`}
        confirmLabel="Выполнено ✓"
        cancelLabel="Отмена"
        variant="success"
        onConfirm={handleComplete}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen && confirmModal.action === 'delete'}
        icon="🗑"
        title="Удалить задачу"
        text={`Вы точно хотите удалить "${confirmModal.planTitle}"?`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
}
