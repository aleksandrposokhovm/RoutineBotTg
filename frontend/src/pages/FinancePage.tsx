import { useState, useEffect, useCallback } from 'react';
import { financeApi } from '../api';
import type { 
  FinanceAccount, 
  ExpenseCategory, 
  FinanceStats,
  FinanceTransaction 
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

  // Вкладка: 'expenses' (расходы) | 'incomes' (доходы)
  const [activeSection, setActiveSection] = useState<'expenses' | 'incomes'>('expenses');

  // Состояние данных
  const [account, setAccount] = useState<FinanceAccount | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [stats, setStats] = useState<FinanceStats>({ income: 0, expense: 0 });
  const [loading, setLoading] = useState(true);

  // Состояние модалок
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<ExpenseCategory | null>(null);

  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
  const [selectedCategoryForTx, setSelectedCategoryForTx] = useState<ExpenseCategory | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<FinanceTransaction | null>(null);

  // Состояние детального просмотра категории
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<ExpenseCategory | null>(null);

  // Загрузка данных
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // 1. Получаем счета
      const accountsList = await financeApi.getAccounts();
      if (accountsList.length > 0) {
        setAccount(accountsList[0]);
      }

      // 2. Получаем категории с расходами за месяц
      const categoriesList = await financeApi.getCategories(currentMonth);
      setCategories(categoriesList);

      // 3. Получаем все транзакции за месяц (для списка доходов)
      const transactionsList = await financeApi.getTransactions(currentMonth);
      setTransactions(transactionsList);

      // 4. Получаем общую статистику за месяц
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

  // Создание / Обновление транзакции
  const handleSaveTransaction = async (data: {
    type: 'income' | 'expense';
    amount: number;
    comment: string;
    date: string;
    categoryId?: number;
  }) => {
    if (!account) return;
    try {
      if (transactionToEdit) {
        // Режим редактирования
        await financeApi.updateTransaction(transactionToEdit.id, {
          amount: data.amount,
          comment: data.comment,
          date: data.date
        });
        triggerHaptic('success');
      } else {
        // Режим создания
        await financeApi.createTransaction({
          type: data.type,
          amount: data.amount,
          comment: data.comment,
          date: data.date,
          accountId: account.id,
          categoryId: data.categoryId
        });
        triggerHaptic('success');
      }
      
      setTransactionToEdit(null);
      loadData();
    } catch (e) {
      console.error('Error saving transaction:', e);
      alert('Ошибка при сохранении операции');
    }
  };

  // Редактирование дохода
  const handleEditIncome = (tx: FinanceTransaction) => {
    setTransactionToEdit(tx);
    setTransactionType('income');
    setIsTransactionOpen(true);
    triggerHaptic('light');
  };

  // Удаление дохода
  const handleDeleteIncome = async (txId: number) => {
    const confirmDelete = window.confirm('Вы действительно хотите удалить это пополнение?');
    if (!confirmDelete) return;

    try {
      await financeApi.deleteTransaction(txId);
      triggerHaptic('success');
      loadData();
    } catch (e) {
      console.error('Error deleting income:', e);
      alert('Не удалось удалить пополнение');
    }
  };

  // Группировка доходов по дням
  const groupIncomesByDay = () => {
    const incomes = transactions.filter(t => t.type === 'income');
    const groups: { [key: string]: FinanceTransaction[] } = {};
    incomes.forEach((tx) => {
      const dateStr = tx.date;
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(tx);
    });
    return groups;
  };

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    
    const localToday = new Date();
    const offset = localToday.getTimezoneOffset();
    const adjustedDate = new Date(localToday.getTime() - (offset * 60 * 1000));
    const todayStr = adjustedDate.toISOString().split('T')[0];

    const yesterdayDate = new Date(adjustedDate);
    yesterdayDate.setDate(adjustedDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    const formatOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    const weekdayOptions: Intl.DateTimeFormatOptions = { weekday: 'long' };

    const dateFormatted = date.toLocaleDateString('ru-RU', formatOptions);
    const weekday = date.toLocaleDateString('ru-RU', weekdayOptions);

    if (dateStr === todayStr) {
      return `Сегодня, ${dateFormatted}`;
    } else if (dateStr === yesterdayStr) {
      return `Вчера, ${dateFormatted}`;
    } else {
      const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      return `${dateFormatted}, ${capitalizedWeekday}`;
    }
  };

  const groupedIncomes = groupIncomesByDay();
  const sortedIncomeDays = Object.keys(groupedIncomes).sort((a, b) => b.localeCompare(a));

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

      {/* Переключатель разделов: Segmented Control */}
      <div className="segmented-control-container">
        <div className="segmented-control">
          <button 
            className={`segmented-control-btn ${activeSection === 'expenses' ? 'active' : ''}`}
            onClick={() => {
              setActiveSection('expenses');
              triggerHaptic('light');
            }}
          >
            Расходы
          </button>
          <button 
            className={`segmented-control-btn ${activeSection === 'incomes' ? 'active' : ''}`}
            onClick={() => {
              setActiveSection('incomes');
              triggerHaptic('light');
            }}
          >
            Доходы
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Загрузка финансовых данных...
        </div>
      ) : activeSection === 'expenses' ? (
        /* ================= РАЗДЕЛ РАСХОДОВ ================= */
        <>
          {/* Сводная карточка расходов */}
          <div className="income-balance-card" style={{ borderColor: 'rgba(45, 45, 45, 0.15)' }}>
            <div className="balance-title">Расходы за {getMonthLabel(currentMonth)}</div>
            <div className="balance-value" style={{ color: 'var(--text-primary)' }}>
              -{stats.expense} ₽
            </div>
            <div className="balance-details">
              Баланс кошелька: <strong>{account ? account.balance : 0} ₽</strong>
            </div>
          </div>

          {/* Сетка категорий */}
          <div className="categories-section">
            <div className="categories-title-row" style={{ marginBottom: '20px' }}>
              <h2>Категории расходов</h2>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                Нажмите для аналитики и внесения расхода
              </span>
            </div>

            <div className="categories-grid">
              {categories.map((cat) => (
                <div 
                  key={cat.id}
                  className="category-circle-wrapper"
                  data-category-id={cat.id}
                  onClick={() => {
                    setSelectedCategoryDetail(cat);
                    triggerHaptic('light');
                  }}
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

              {/* Добавить категорию */}
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
          </div>
        </>
      ) : (
        /* ================= РАЗДЕЛ ДОХОДОВ ================= */
        <>
          {/* Сводная карточка доходов */}
          <div className="income-balance-card" style={{ borderColor: 'rgba(90, 143, 90, 0.25)' }}>
            <div className="balance-title">Текущий баланс кошелька</div>
            <div className="balance-value" style={{ color: 'var(--color-success)' }}>
              {account ? account.balance : 0} ₽
            </div>
            <div className="balance-details">
              Поступления за месяц: <strong>+{stats.income} ₽</strong>
            </div>
          </div>

          {/* Кнопка "Добавить доход" */}
          <div className="finance-action-btn-container">
            <button 
              className="finance-action-btn income-btn"
              onClick={() => {
                setTransactionType('income');
                setTransactionToEdit(null);
                setIsTransactionOpen(true);
                triggerHaptic('light');
              }}
            >
              ➕ Внести доход
            </button>
          </div>

          {/* Список доходов */}
          <div className="transactions-section" style={{ margin: 0 }}>
            <h2 style={{ marginBottom: '16px' }}>Поступления средств</h2>
            {sortedIncomeDays.length === 0 ? (
              <div className="transactions-list-empty">
                Нет поступлений в этом месяце. Нажмите кнопку выше, чтобы добавить первый доход
              </div>
            ) : (
              sortedIncomeDays.map((day) => (
                <div key={day} className="transaction-day-group">
                  <div className="transaction-day-title">{formatDateLabel(day)}</div>
                  <div className="transaction-day-items">
                    {groupedIncomes[day].map((tx) => (
                      <div key={tx.id} className="transaction-item">
                        <div className="transaction-item-left">
                          <div 
                            className="transaction-item-icon"
                            style={{ backgroundColor: 'rgba(90, 143, 90, 0.15)', color: 'var(--color-success)' }}
                          >
                            💰
                          </div>
                          <div className="transaction-item-details">
                            <span className="transaction-item-title">
                              {tx.comment || 'Пополнение'}
                            </span>
                            <span className="transaction-item-comment">
                              {tx.date.split('-').reverse().join('.')}
                            </span>
                          </div>
                        </div>

                        <div className="transaction-item-right" style={{ gap: '4px' }}>
                          <span className="transaction-item-amount income" style={{ marginRight: '8px' }}>
                            +{tx.amount} ₽
                          </span>
                          
                          {/* Кнопка изменения */}
                          <button 
                            className="transaction-item-delete"
                            onClick={() => handleEditIncome(tx)}
                            title="Изменить доход"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            ✏️
                          </button>

                          {/* Кнопка удаления */}
                          <button 
                            className="transaction-item-delete"
                            onClick={() => handleDeleteIncome(tx.id)}
                            title="Удалить доход"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Модалка создания/редактирования категории */}
      <AddCategoryModal
        isOpen={isAddCategoryOpen}
        onClose={() => {
          setIsAddCategoryOpen(false);
          setCategoryToEdit(null);
        }}
        onSave={handleSaveCategory}
        categoryToEdit={categoryToEdit}
      />

      {/* Модалка создания/редактирования транзакции (доход / расход) */}
      <TransactionModal
        isOpen={isTransactionOpen}
        onClose={() => {
          setIsTransactionOpen(false);
          setSelectedCategoryForTx(null);
          setTransactionToEdit(null);
        }}
        onSave={handleSaveTransaction}
        type={transactionType}
        category={selectedCategoryForTx}
        transactionToEdit={transactionToEdit}
      />
    </div>
  );
}
