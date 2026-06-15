import React, { useState, useEffect, useCallback } from 'react';
import { financeApi } from '../api';
import type { ExpenseCategory, FinanceTransaction } from '../api';
import { TransactionModal } from './TransactionModal';

interface CategoryDetailViewProps {
  category: ExpenseCategory;
  initialMonth: string; // YYYY-MM
  onClose: () => void;
  onCategoryDeleted: () => void;
  onTransactionDeleted: () => void;
}

export const CategoryDetailView: React.FC<CategoryDetailViewProps> = ({
  category,
  initialMonth,
  onClose,
  onCategoryDeleted,
  onTransactionDeleted
}) => {
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [history, setHistory] = useState<{ month: string; label: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Состояние модалки ввода/редактирования транзакции
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<FinanceTransaction | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await financeApi.getCategoryStats(category.id, currentMonth);
      setTransactions(data.transactions);
      setHistory(data.history);
    } catch (err) {
      console.error('Error loading category stats:', err);
      setError('Не удалось загрузить данные категории');
    } finally {
      setLoading(false);
    }
  }, [category.id, currentMonth]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Навигация по месяцам
  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const y = prevDate.getFullYear();
    const m = String(prevDate.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${y}-${m}`);
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${y}-${m}`);
  };

  const getMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    const name = d.toLocaleString('ru-RU', { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + year;
  };

  // Удаление транзакции
  const handleDeleteTransaction = async (txId: number) => {
    const confirmDelete = window.confirm('Вы действительно хотите удалить эту транзакцию?');
    if (!confirmDelete) return;

    try {
      await financeApi.deleteTransaction(txId);
      loadStats();
      onTransactionDeleted();
    } catch (err) {
      console.error('Error deleting transaction:', err);
      alert('Не удалось удалить транзакцию');
    }
  };

  // Удаление категории
  const handleDeleteCategory = async () => {
    const confirmDelete = window.confirm(
      'Вы действительно хотите удалить эту категорию? Все транзакции по ней останутся в истории, но сама категория исчезнет.'
    );
    if (!confirmDelete) return;

    try {
      await financeApi.deleteCategory(category.id);
      onCategoryDeleted();
      onClose();
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Не удалось удалить категорию');
    }
  };

  // Создание / Редактирование транзакции расхода
  const handleSaveTransaction = async (data: {
    type: 'income' | 'expense';
    amount: number;
    comment: string;
    date: string;
  }) => {
    try {
      const accountsList = await financeApi.getAccounts();
      if (accountsList.length === 0) return;

      if (transactionToEdit) {
        // Редактируем существующий расход
        await financeApi.updateTransaction(transactionToEdit.id, {
          amount: data.amount,
          comment: data.comment,
          date: data.date
        });
      } else {
        // Создаем новый расход
        await financeApi.createTransaction({
          type: data.type,
          amount: data.amount,
          comment: data.comment,
          date: data.date,
          accountId: accountsList[0].id,
          categoryId: category.id
        });
      }

      setTransactionToEdit(null);
      loadStats();
      onTransactionDeleted(); // Обновляем родителя
    } catch (err) {
      console.error('Error saving transaction:', err);
      alert('Не удалось сохранить расход');
    }
  };

  // Группировка транзакций по дням
  const groupTransactionsByDay = () => {
    const groups: { [key: string]: FinanceTransaction[] } = {};
    transactions.forEach((tx) => {
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

  // Рендеринг SVG Графика
  const renderChart = () => {
    if (history.length === 0) return null;

    const maxAmount = Math.max(...history.map((h) => h.amount));
    const chartHeight = 110;
    const chartWidth = 300;
    const paddingX = 25;
    const paddingY = 15;

    const points = history.map((h, i) => {
      const x = paddingX + (i * (chartWidth - 2 * paddingX)) / (history.length - 1);
      const y = maxAmount > 0
        ? chartHeight - paddingY - (h.amount / maxAmount) * (chartHeight - 2 * paddingY)
        : chartHeight / 2;
      return { x, y, ...h };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    const areaPath = points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${chartHeight - paddingY} L ${points[0].x} ${chartHeight - paddingY} Z`
      : '';

    return (
      <div className="chart-wrapper">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart-svg">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={category.color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={category.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3" />
          <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3,3" />
          <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="var(--border-color)" strokeWidth="1" />

          {areaPath && <path d={areaPath} fill="url(#areaGradient)" />}

          <path d={linePath} fill="none" stroke={category.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="4.5"
                className="chart-point"
                style={{ fill: category.color, stroke: 'var(--bg-card)', strokeWidth: 2 }}
              />
              {p.amount > 0 && (
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="700"
                  fill="var(--text-primary)"
                >
                  {Math.round(p.amount)} ₽
                </text>
              )}
            </g>
          ))}
        </svg>

        <div className="chart-labels">
          {points.map((p, i) => (
            <div key={i} className="chart-label-item" style={{ width: `${100 / history.length}%` }}>
              <span className="chart-month-name">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const grouped = groupTransactionsByDay();
  const sortedDays = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="category-detail-view">
      <header className="category-detail-header">
        <div className="category-detail-header-left">
          <button className="category-back-btn" onClick={onClose}>
            ←
          </button>
          <div className="category-header-title">
            <h1>
              <span 
                style={{ 
                  backgroundColor: category.color, 
                  borderRadius: '50%', 
                  width: '28px', 
                  height: '28px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '16px'
                }}
              >
                {category.icon}
              </span>
              {category.name}
            </h1>
            <span>Аналитика категории</span>
          </div>
        </div>

        <button className="category-delete-btn" onClick={handleDeleteCategory}>
          Удалить
        </button>
      </header>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 10px 0' }}>
        <div className="finance-period-selector">
          <button className="finance-period-btn" onClick={handlePrevMonth}>
            ‹
          </button>
          <span className="finance-period-label">{getMonthLabel(currentMonth)}</span>
          <button className="finance-period-btn" onClick={handleNextMonth}>
            ›
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Загрузка статистики...
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-danger)' }}>
          {error}
        </div>
      ) : (
        <>
          <div className="chart-section">
            <div className="chart-section-title">Тренд расходов за 4 месяца</div>
            {renderChart()}
          </div>

          <div className="transactions-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2>История расходов</h2>
              <button 
                className="finance-action-btn"
                style={{ 
                  margin: 0, 
                  padding: '6px 14px', 
                  fontSize: 'var(--font-size-xs)', 
                  borderRadius: 'var(--radius-md)', 
                  background: 'var(--color-graphite)', 
                  color: 'white' 
                }}
                onClick={() => {
                  setTransactionToEdit(null);
                  setIsTxModalOpen(true);
                }}
              >
                ➕ Добавить расход
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="transactions-list-empty">
                Нет расходов по этой категории в выбранном месяце
              </div>
            ) : (
              sortedDays.map((day) => (
                <div key={day} className="transaction-day-group">
                  <div className="transaction-day-title">{formatDateLabel(day)}</div>
                  <div className="transaction-day-items">
                    {grouped[day].map((tx) => (
                      <div key={tx.id} className="transaction-item">
                        <div className="transaction-item-left">
                          <div 
                            className="transaction-item-icon"
                            style={{ backgroundColor: `${category.color}40`, color: 'var(--text-primary)' }}
                          >
                            {category.icon}
                          </div>
                          <div className="transaction-item-details">
                            <span className="transaction-item-title">{category.name}</span>
                            {tx.comment && (
                              <span className="transaction-item-comment">{tx.comment}</span>
                            )}
                          </div>
                        </div>

                        <div className="transaction-item-right" style={{ gap: '4px' }}>
                          <span className="transaction-item-amount expense">
                            -{tx.amount} ₽
                          </span>
                          
                          {/* Кнопка редактирования */}
                          <button 
                            className="transaction-item-edit"
                            onClick={() => {
                              setTransactionToEdit(tx);
                              setIsTxModalOpen(true);
                            }}
                            title="Редактировать транзакцию"
                          >
                            ✏️
                          </button>

                          {/* Кнопка удаления */}
                          <button 
                            className="transaction-item-delete"
                            onClick={() => handleDeleteTransaction(tx.id)}
                            title="Удалить транзакцию"
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

      {/* Модалка транзакции расхода */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setTransactionToEdit(null);
        }}
        onSave={handleSaveTransaction}
        type="expense"
        category={category}
        transactionToEdit={transactionToEdit}
      />
    </div>
  );
};
