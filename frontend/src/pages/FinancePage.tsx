import React, { useState, useEffect, useCallback, useRef } from 'react';
import { financeApi } from '../api';
import type { 
  FinanceAccount, 
  ExpenseCategory, 
  FinanceStats 
} from '../api';
import { AddCategoryModal } from '../components/AddCategoryModal';
import { TransactionModal } from '../components/TransactionModal';
import { CategoryDetailView } from '../components/CategoryDetailView';

// Безопасный вызов Telegram WebApp Haptic
const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.HapticFeedback) {
    if (type === 'success' || type === 'warning' || type === 'error') {
      tg.HapticFeedback.notificationOccurred(type);
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  }
};

export function FinancePage() {
  // Выбранный месяц (YYYY-MM)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Состояние данных
  const [account, setAccount] = useState<FinanceAccount | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [stats, setStats] = useState<FinanceStats>({ income: 0, expense: 0 });
  const [loading, setLoading] = useState(true);

  // Состояние модалок
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<ExpenseCategory | null>(null);

  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
  const [selectedCategoryForTx, setSelectedCategoryForTx] = useState<ExpenseCategory | null>(null);

  // Состояние детального просмотра
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<ExpenseCategory | null>(null);

  // Реф для отслеживания перетаскивания
  const dragInfo = useRef<{
    startX: number;
    startY: number;
    ghost: HTMLDivElement | null;
    currentOverId: number | null;
  }>({
    startX: 0,
    startY: 0,
    ghost: null,
    currentOverId: null
  });

  // Загрузка данных
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // 1. Получаем счета (если счетов нет, бэкенд создаст "Кошелек")
      const accountsList = await financeApi.getAccounts();
      if (accountsList.length > 0) {
        setAccount(accountsList[0]);
      }

      // 2. Получаем категории с расходами за выбранный месяц
      const categoriesList = await financeApi.getCategories(currentMonth);
      setCategories(categoriesList);

      // 3. Получаем общую статистику за месяц
      const monthlyStats = await financeApi.getStats(currentMonth);
      setStats(monthlyStats);

    } catch (e) {
      console.error('Error loading finance data:', e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Навигация по месяцам
  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const y = prevDate.getFullYear();
    const m = String(prevDate.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${y}-${m}`);
    triggerHaptic('light');
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${y}-${m}`);
    triggerHaptic('light');
  };

  const getMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    const name = d.toLocaleString('ru-RU', { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + year;
  };

  // Создание/обновление категории
  const handleSaveCategory = async (data: { name: string; icon: string; color: string }) => {
    try {
      if (categoryToEdit) {
        await financeApi.updateCategory(categoryToEdit.id, data);
        triggerHaptic('success');
      } else {
        await financeApi.createCategory(data);
        triggerHaptic('success');
      }
      setCategoryToEdit(null);
      loadData();
    } catch (e) {
      console.error('Error saving category:', e);
    }
  };

  // Создание транзакции
  const handleSaveTransaction = async (data: {
    type: 'income' | 'expense';
    amount: number;
    comment: string;
    date: string;
    categoryId?: number;
  }) => {
    if (!account) return;
    try {
      const result = await financeApi.createTransaction({
        type: data.type,
        amount: data.amount,
        comment: data.comment,
        date: data.date,
        accountId: account.id,
        categoryId: data.categoryId
      });
      
      triggerHaptic('success');
      
      // Обновляем баланс и список расходов локально
      setAccount(result.updatedAccount);
      loadData();
    } catch (e) {
      console.error('Error saving transaction:', e);
      alert('Ошибка при сохранении операции');
    }
  };

  // ─── Touch Drag-and-Drop Логика ───

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!account || account.balance <= 0) return; // Не перетаскиваем, если баланс нулевой или отрицательный

    const touch = e.touches[0];
    dragInfo.current.startX = touch.clientX;
    dragInfo.current.startY = touch.clientY;

    // Вибрация начала перетаскивания
    triggerHaptic('medium');

    // Создаем ghost-круг в DOM
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerText = '₽';
    ghost.style.left = `${touch.clientX}px`;
    ghost.style.top = `${touch.clientY}px`;
    document.body.appendChild(ghost);

    dragInfo.current.ghost = ghost;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const ghost = dragInfo.current.ghost;
    if (!ghost) return;

    const touch = e.touches[0];
    ghost.style.left = `${touch.clientX}px`;
    ghost.style.top = `${touch.clientY}px`;

    // Определяем, над каким элементом сейчас находится палец
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    // Ищем контейнер категории с атрибутом data-category-id
    const categoryEl = element.closest('[data-category-id]');
    if (categoryEl) {
      const categoryId = parseInt(categoryEl.getAttribute('data-category-id') || '0');
      if (categoryId && dragInfo.current.currentOverId !== categoryId) {
        // Убираем подсветку со старого
        if (dragInfo.current.currentOverId) {
          const prevEl = document.querySelector(`[data-category-id="${dragInfo.current.currentOverId}"] .category-circle`);
          prevEl?.classList.remove('drag-over');
        }
        
        // Подсвечиваем новый
        const currentCircle = categoryEl.querySelector('.category-circle');
        currentCircle?.classList.add('drag-over');
        
        dragInfo.current.currentOverId = categoryId;
        
        // Легкая вибрация при наведении на цель
        triggerHaptic('light');
      }
    } else {
      // Палец вышел за пределы категорий
      if (dragInfo.current.currentOverId) {
        const prevEl = document.querySelector(`[data-category-id="${dragInfo.current.currentOverId}"] .category-circle`);
        prevEl?.classList.remove('drag-over');
        dragInfo.current.currentOverId = null;
      }
    }
  };

  const handleTouchEnd = () => {
    const ghost = dragInfo.current.ghost;
    if (!ghost) return;

    // Удаляем ghost элемент
    ghost.remove();
    dragInfo.current.ghost = null;

    // Снимаем подсветку с подсвеченной категории
    const overId = dragInfo.current.currentOverId;
    if (overId) {
      const circleEl = document.querySelector(`[data-category-id="${overId}"] .category-circle`);
      circleEl?.classList.remove('drag-over');
      dragInfo.current.currentOverId = null;

      // Находим выбранную категорию
      const targetCat = categories.find((c) => c.id === overId);
      if (targetCat) {
        // Успех! Открываем форму расхода для этой категории
        setSelectedCategoryForTx(targetCat);
        setTransactionType('expense');
        setIsTransactionOpen(true);
        triggerHaptic('success');
      }
    }
  };

  const handleCircleClick = () => {
    // При тапе открываем быстрое пополнение баланса
    setTransactionType('income');
    setSelectedCategoryForTx(null);
    setIsTransactionOpen(true);
    triggerHaptic('light');
  };

  const handleCategoryClick = (cat: ExpenseCategory) => {
    setSelectedCategoryDetail(cat);
    triggerHaptic('light');
  };

  if (selectedCategoryDetail) {
    return (
      <CategoryDetailView
        category={selectedCategoryDetail}
        initialMonth={currentMonth}
        onClose={() => setSelectedCategoryDetail(null)}
        onCategoryDeleted={() => {
          setSelectedCategoryDetail(null);
          loadData();
        }}
        onTransactionDeleted={() => {
          loadData();
        }}
      />
    );
  }

  return (
    <div className="finance-container">
      <header className="finance-header">
        <h1>💰 Финансы</h1>
        
        {/* Переключатель месяца */}
        <div className="finance-period-selector">
          <button className="finance-period-btn" onClick={handlePrevMonth}>
            ‹
          </button>
          <span className="finance-period-label">{getMonthLabel(currentMonth)}</span>
          <button className="finance-period-btn" onClick={handleNextMonth}>
            ›
          </button>
        </div>
      </header>

      {/* Карточки аналитики */}
      <div className="finance-stats-grid">
        <div className="finance-stat-card income">
          <span className="stat-label">Доходы</span>
          <span className="stat-value">+{stats.income} ₽</span>
        </div>
        <div className="finance-stat-card expense">
          <span className="stat-label">Расходы</span>
          <span className="stat-value">-{stats.expense} ₽</span>
        </div>
      </div>

      {/* Большой круг Баланса (Кошелек) */}
      <div className="balance-circle-section">
        <div className="balance-circle-container">
          <div 
            className="balance-circle"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleCircleClick}
          >
            <span className="balance-circle-label">Баланс</span>
            <span className="balance-circle-value">
              {account ? account.balance : 0}
            </span>
            <span className="balance-circle-currency">рублей</span>
          </div>
          
          <div className="balance-circle-pulsate" />
          
          {/* Кнопка "+" внизу справа от круга для быстрого пополнения */}
          <button 
            className="balance-circle-add" 
            onClick={handleCircleClick}
            title="Пополнить баланс"
          >
            +
          </button>
        </div>
      </div>

      {/* Сетка категорий расходов */}
      <div className="categories-section">
        <div className="categories-title-row">
          <h2>Категории расходов</h2>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            {account && account.balance > 0 
              ? 'Перетащите баланс в круг для расхода' 
              : 'Пополните баланс, чтобы вносить расходы'}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            Загрузка категорий...
          </div>
        ) : (
          <div className="categories-grid">
            {categories.map((cat) => (
              <div 
                key={cat.id}
                className="category-circle-wrapper"
                data-category-id={cat.id}
                onClick={() => handleCategoryClick(cat)}
              >
                <div 
                  className="category-circle"
                  style={{ backgroundColor: `${cat.color}40`, borderColor: cat.color }}
                >
                  <span className="category-circle-icon">{cat.icon}</span>
                  {cat.spentThisMonth > 0 && (
                    <div className="category-badge">
                      {Math.round(cat.spentThisMonth)} ₽
                    </div>
                  )}
                </div>
                <span className="category-label">{cat.name}</span>
              </div>
            ))}

            {/* Кнопка "+" для добавления категории */}
            <div className="category-circle-wrapper" onClick={() => setIsAddCategoryOpen(true)}>
              <button className="category-circle add-category-btn">
                <span className="add-category-icon">+</span>
              </button>
              <span className="category-label">Категория</span>
            </div>
          </div>
        )}
      </div>

      {/* Модалка создания категории */}
      <AddCategoryModal
        isOpen={isAddCategoryOpen}
        onClose={() => {
          setIsAddCategoryOpen(false);
          setCategoryToEdit(null);
        }}
        onSave={handleSaveCategory}
        categoryToEdit={categoryToEdit}
      />

      {/* Модалка транзакции (доход / расход) */}
      <TransactionModal
        isOpen={isTransactionOpen}
        onClose={() => {
          setIsTransactionOpen(false);
          setSelectedCategoryForTx(null);
        }}
        onSave={handleSaveTransaction}
        type={transactionType}
        category={selectedCategoryForTx}
      />
    </div>
  );
}
