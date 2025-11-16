import { useState, useEffect } from 'react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  isRead: boolean;
  createdAt: string;
  metadata?: any;
}

export default function NotificationsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';

  useEffect(() => {
    loadNotifications();
    // Recargar notificaciones cada 30 segundos
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/notifications`);
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`${API_URL}/api/system/notifications/${notificationId}/read`, {
        method: 'POST'
      });
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (error) {
      console.error('Error marcando notificación como leída:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${API_URL}/api/system/notifications/read-all`, {
        method: 'POST'
      });
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marcando todas como leídas:', error);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'success': return '✅';
      default: return 'ℹ️';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'stock_low': return '⚠️';
      case 'expiring': return '⏳';
      case 'no_sales': return '📉';
      case 'price_suggestion': return '💸';
      case 'combo_recommendation': return '🍱';
      case 'promotion_time': return '🔥';
      case 'system_alert': return '🛠';
      default: return '🔔';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative px-3 py-2 text-lg text-[#111111] hover:bg-[#F9F9F9] rounded transition-all"
        title="Notificaciones del sistema"
      >
        <span>🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 bg-white border border-[#FFC300] shadow-lg rounded-sm z-50 max-h-[600px] overflow-y-auto">
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#C7C7C7]">
              <h3 className="text-lg font-bold text-[#111111]">🔔 Notificaciones</h3>
              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-[#C7C7C7] hover:text-[#111111] transition-colors"
                  >
                    Marcar todas como leídas
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-[#C7C7C7] hover:text-[#111111] transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Lista de notificaciones */}
            <div className="space-y-2">
              {notifications.length === 0 ? (
                <p className="text-sm text-[#C7C7C7] text-center py-8">No hay notificaciones</p>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => !notification.isRead && markAsRead(notification.id)}
                    className={`p-3 border rounded-sm cursor-pointer transition-all ${
                      notification.isRead
                        ? 'border-[#C7C7C7] bg-[#F9F9F9]'
                        : 'border-[#FFC300] bg-white shadow-sm'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <span className="text-xl">{getTypeIcon(notification.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className={`text-sm font-bold ${notification.isRead ? 'text-[#C7C7C7]' : 'text-[#111111]'}`}>
                            {notification.title}
                          </h4>
                          <span className="text-sm">{getSeverityIcon(notification.severity)}</span>
                          {!notification.isRead && (
                            <span className="w-2 h-2 bg-[#FFC300] rounded-full"></span>
                          )}
                        </div>
                        <p className={`text-xs mt-1 ${notification.isRead ? 'text-[#C7C7C7]' : 'text-[#111111]'}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-[#C7C7C7] mt-1">
                          {new Date(notification.createdAt).toLocaleString('es-AR')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

