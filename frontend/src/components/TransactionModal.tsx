import React, { useState, useEffect } from 'react';
import type { ExpenseCategory } from '../api';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    type: 'income' | 'expense';
    amount: number;
    comment: string;
    date: string;
    categoryId?: number;
  }) => void;
  type: 'income' | 'expense';
  category?: ExpenseCategory | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  type,
  category
}) => {
  const [amountStr, setAmountStr] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmountStr('');
      setComment('');
      
      // Инициализация даты сегодняшним днем в формате YYYY-MM-DD
      const localToday = new Date();
      const offset = localToday.getTimezoneOffset();
      const adjustedDate = new Date(localToday.getTime() - (offset * 60 * 1000));
      const formattedDate = adjustedDate.toISOString().split('T')[0];
      setDate(formattedDate);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Разрешаем только цифры и одну точку
    if (/^\d*\.?\d*$/.test(val)) {
      setAmountStr(val);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    onSave({
      type,
      amount,
      comment: comment.trim(),
      date,
      categoryId: category?.id
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '340px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon" style={{ fontSize: '32px', marginBottom: '8px' }}>
          {type === 'income' ? '💰' : category?.icon || '💸'}
        </div>
        <div className="modal-title">
          {type === 'income' ? 'Пополнение баланса' : `Расход: ${category?.name}`}
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
          {/* Крупный ввод суммы */}
          <div className="amount-input-container">
            <input
              type="text"
              inputMode="decimal"
              className="finance-input-amount"
              placeholder="0"
              value={amountStr}
              onChange={handleAmountChange}
              autoFocus
              required
            />
            <span className="amount-currency-label">₽</span>
          </div>

          <div className="finance-form-group">
            <label htmlFor="tx-comment">Комментарий</label>
            <input
              id="tx-comment"
              type="text"
              className="finance-input"
              placeholder={type === 'income' ? 'Источник дохода' : 'На что потрачено'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="finance-form-group">
            <label htmlFor="tx-date">Дата</label>
            <input
              id="tx-date"
              type="date"
              className="finance-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions" style={{ marginTop: '24px' }}>
            <button 
              type="button" 
              className="modal-btn modal-btn-secondary" 
              onClick={onClose}
            >
              Отмена
            </button>
            <button 
              type="submit" 
              className="modal-btn modal-btn-primary"
              disabled={!amountStr || parseFloat(amountStr) <= 0}
              style={{
                backgroundColor: (!amountStr || parseFloat(amountStr) <= 0) 
                  ? 'var(--text-disabled)' 
                  : (type === 'income' ? 'var(--color-success)' : 'var(--color-graphite)'),
                color: 'white'
              }}
            >
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
