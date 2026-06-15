import React, { useState, useEffect } from 'react';
import type { ExpenseCategory } from '../api';

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; icon: string; color: string }) => void;
  categoryToEdit?: ExpenseCategory | null;
}

const EMOJIS = [
  '🍔', '🛒', '🚗', '🏠', '👕', '🎮', '🍿', '🎁', 
  '🔌', '💊', '💅', '✈️', '📚', '☕', '🍷', '🍕', 
  '🚌', '🚕', '⛽', '🛋️', '🧹', '👶', '🐱', '🐶', 
  '💻', '📱', '🏋️', '💈', '🎭', '🎤', '🎳', '🛍️', 
  '💰', '💵', '💳', '🔧', '🧱', '🚭', '🧴', '🎟️'
];

const COLORS = [
  '#FFB3BA', // Пастельный красный/розовый
  '#FFDFBA', // Пастельный оранжевый
  '#FFFFBA', // Пастельный желтый
  '#BFFCC6', // Пастельный зеленый
  '#B3F6F2', // Пастельный бирюзовый
  '#BAE1FF', // Пастельный голубой
  '#D6C7FF', // Пастельный сиреневый
  '#FFC6FF', // Пастельный фуксия
  '#E8DCC4', // Пастельный бежевый
  '#D4E2D4', // Пастельный шалфей
  '#E6E6FA', // Лавандовый
  '#F5C6AA'  // Персиковый
];

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categoryToEdit
}) => {
  const [name, setName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0]);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  useEffect(() => {
    if (isOpen) {
      if (categoryToEdit) {
        setName(categoryToEdit.name);
        setSelectedEmoji(categoryToEdit.icon);
        setSelectedColor(categoryToEdit.color);
      } else {
        setName('');
        setSelectedEmoji(EMOJIS[0]);
        setSelectedColor(COLORS[0]);
      }
    }
  }, [isOpen, categoryToEdit]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') return;
    onSave({
      name: name.trim(),
      icon: selectedEmoji,
      color: selectedColor
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '340px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {categoryToEdit ? 'Редактировать категорию' : 'Новая категория'}
        </div>
        
        <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
          {/* Предпросмотр круга категории */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div 
              style={{
                width: '70px',
                height: '70px',
                borderRadius: '50%',
                backgroundColor: selectedColor,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                fontSize: '32px',
                boxShadow: 'var(--shadow-md)',
                border: '2px solid rgba(45, 45, 45, 0.15)'
              }}
            >
              {selectedEmoji}
            </div>
          </div>

          <div className="finance-form-group">
            <label htmlFor="category-name">Название</label>
            <input
              id="category-name"
              type="text"
              className="finance-input"
              placeholder="Например, Продукты"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoFocus
              required
            />
          </div>

          <div className="finance-form-group">
            <label>Иконка ({EMOJIS.length})</label>
            <div className="emoji-grid">
              {EMOJIS.map((emoji) => (
                <div
                  key={emoji}
                  className={`emoji-item ${selectedEmoji === emoji ? 'selected' : ''}`}
                  onClick={() => setSelectedEmoji(emoji)}
                >
                  {emoji}
                </div>
              ))}
            </div>
          </div>

          <div className="finance-form-group">
            <label>Цвет категории</label>
            <div className="color-grid">
              {COLORS.map((color) => (
                <div
                  key={color}
                  className={`color-item ${selectedColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
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
              disabled={name.trim() === ''}
              style={{
                backgroundColor: name.trim() === '' ? 'var(--text-disabled)' : 'var(--color-graphite)',
                color: 'white'
              }}
            >
              {categoryToEdit ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
