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

  // Режим распределения средств (когда нажали на баланс и выбираем категорию)
  const [isDistributing, setIsDistributing] = useState(false);

  // Состояние модалок
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<ExpenseCategory | null>(null);

  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
  const [selectedCategoryForTx, setSelectedCategoryForTx] = useState<ExpenseCategory | null>(null);

  // Состояние детального просмотра
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<ExpenseCategory | null>(null);

  // Реф на центральный круг баланса для вычисления координат полета
  const balanceRef = useRef<HTMLDivElement | null>(null);

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
    setIsDistributing(false); // Сбрасываем режим распределения при смене месяца
    triggerHaptic('light');
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${y}-${m}`);
    setIsDistributing(false);
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

  // ─── Анимация полета монеты (Luxury Coin Fly) ───
  const flyCoin = (fromEl: HTMLElement, toEl: HTMLElement) => {
    const fromRect = fromEl.getBoundingClientRect();
    const toCircle = toEl.querySelector('.category-circle');
    const toRect = toCircle ? toCircle.getBoundingClientRect() : toEl.getBoundingClientRect();

    // Создаем элемент монеты
    const coin = document.createElement('div');
    coin.className = 'luxury-coin-fly';
    coin.innerText = '₽';
    document.body.appendChild(coin);

    // Центр начальной и конечной точек
    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;

    // Средняя точка по X и завышенная по Y (эффект параболы)
    const midX = (startX + endX) / 2;
    const midY = Math.min(startY, endY) - 90;

    // Кадры анимации (полет по дуге с вращением и масштабированием)
    const keyframes = [
      {
        transform: `translate(${startX - 23}px, ${startY - 23}px) scale(0.3) rotate(0deg)`,
        opacity: 0,
      },
      {
        transform: `translate(${startX - 23}px, ${startY - 23}px) scale(1.1) rotate(45deg)`,
        opacity: 1,
        offset: 0.15
      },
      {
        transform: `translate(${midX - 23}px, ${midY - 23}px) scale(1.5) rotate(180deg)`,
        opacity: 0.95,
        offset: 0.5
      },
      {
        transform: `translate(${endX - 23}px, ${endY - 23}px) scale(0.8) rotate(320deg)`,
        opacity: 0.9,
        offset: 0.85
      },
      {
        transform: `translate(${endX - 23}px, ${endY - 23}px) scale(0.2) rotate(360deg)`,
        opacity: 0
      }
    ];

    const anim = coin.animate(keyframes, {
      duration: 650,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    });

    anim.onfinish = () => {
      coin.remove();
      // Добавляем класс всплеска на категорию
      if (toCircle) {
        toCircle.classList.add('luxury-bump');
        setTimeout(() => {
          toCircle.classList.remove('luxury-bump');
        }, 500);
      }
    };
  };

  const handleCircleClick = () => {
    if (!account || account.balance <= 0) {
      // При нулевом балансе сразу предлагаем пополнить
      setTransactionType('income');
      setSelectedCategoryForTx(null);
      setIsTransactionOpen(true);
      triggerHaptic('light');
      return;
    }
    // Переключаем режим распределения средств
    setIsDistributing(prev => !prev);
    triggerHaptic('light');
  };

  const handleCategoryClick = (cat: ExpenseCategory, e: React.MouseEvent<HTMLDivElement>) => {
    if (isDistributing) {
      if (balanceRef.current) {
        const balanceEl = balanceRef.current;
        const categoryEl = e.currentTarget;

        triggerHaptic('medium');
        
        // Запуск анимации полета монеты
        flyCoin(balanceEl, categoryEl);

        // Отключаем режим распределения
        setIsDistributing(false);

        // Открываем модальное окно добавления расхода после анимации (650мс)
        setTimeout(() => {
          setSelectedCategoryForTx(cat);
          setTransactionType('expense');
          setIsTransactionOpen(true);
          triggerHaptic('success');
        }, 650);
      }
    } else {
      // Обычный клик открывает аналитику
      setSelectedCategoryDetail(cat);
      triggerHaptic('light');
    }
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
            ref={balanceRef}
            className={`balance-circle ${isDistributing ? 'active-distribute' : ''}`}
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
            onClick={() => {
              setTransactionType('income');
              setSelectedCategoryForTx(null);
              setIsTransactionOpen(true);
              triggerHaptic('light');
            }}
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
          <span style={{ 
            fontSize: 'var(--font-size-xs)', 
            color: isDistributing ? 'var(--color-accent)' : 'var(--text-muted)',
            fontWeight: isDistributing ? '700' : 'normal',
            transition: 'color var(--transition-fast)'
          }}>
            {isDistributing 
              ? '✨ Нажмите на категорию ниже'
              : (account && account.balance > 0 
                  ? 'Нажмите на баланс для распределения' 
                  : 'Пополните баланс для внесения расходов')}
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
                onClick={(e) => handleCategoryClick(cat, e)}
              >
                <div 
                  className={`category-circle ${isDistributing ? 'active-target' : ''}`}
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
            <div className="category-circle-wrapper" onClick={() => {
              setIsAddCategoryOpen(true);
              triggerHaptic('light');
            }}>
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
