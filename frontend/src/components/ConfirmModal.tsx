
interface ConfirmModalProps {
  isOpen: boolean;
  icon?: string;
  title: string;
  text: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'success' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  icon = '✅',
  title,
  text,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  variant = 'success',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-icon">{icon}</div>
        <div className="modal-title">{title}</div>
        <div className="modal-text">{text}</div>
        <div className="modal-actions">
          <button className="modal-btn modal-btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`modal-btn ${variant === 'danger' ? 'modal-btn-danger' : 'modal-btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
