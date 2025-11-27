
import type { RouteObject } from 'react-router-dom';
import { lazy } from 'react';

const StoreSelectionPage = lazy(() => import('../pages/store-selection/page'));
const LoginPage = lazy(() => import('../pages/login/page'));
const PromocionesPage = lazy(() => import('../pages/promociones/page'));
const MisPedidosPage = lazy(() => import('../pages/mis-pedidos/page'));
const MiDireccionPage = lazy(() => import('../pages/mi-direccion/page'));
const SuperAdminPage = lazy(() => import('../pages/superadmin/page'));
const HomePage = lazy(() => import('../pages/home/page'));
const MenuPage = lazy(() => import('../pages/menu/page'));
const CheckoutPage = lazy(() => import('../pages/checkout/page'));
const AdminPage = lazy(() => import('../pages/admin/page'));
const OrdersPage = lazy(() => import('../pages/orders/page'));
const DeliveryPage = lazy(() => import('../pages/delivery/page'));
const TrackingPage = lazy(() => import('../pages/tracking/page'));
const MenuManagementPage = lazy(() => import('../pages/menu-management/page'));
const PrivacyPage = lazy(() => import('../pages/privacy/page'));
const InvitarPage = lazy(() => import('../pages/invitar/page'));
const PaymentSuccessPage = lazy(() => import('../pages/payment-success/page'));
const PaymentFailurePage = lazy(() => import('../pages/payment-failure/page'));
const PaymentPendingPage = lazy(() => import('../pages/payment-pending/page'));
const StockIssuePage = lazy(() => import('../pages/stock-issue/page'));
const OrderSuccessPage = lazy(() => import('../pages/order-success/page'));
const WhatsAppQRPage = lazy(() => import('../pages/admin/whatsapp-qr/page'));
const PerfilPage = lazy(() => import('../pages/perfil/page'));
const NotificacionesPage = lazy(() => import('../pages/notificaciones/page'));
const ReferidosPage = lazy(() => import('../pages/referidos/page'));
const CuponesPage = lazy(() => import('../pages/cupones/page'));
const FavoritosPage = lazy(() => import('../pages/favoritos/page'));
const DireccionesPage = lazy(() => import('../pages/direcciones/page'));
const AyudaPage = lazy(() => import('../pages/ayuda/page'));
const AcercaPage = lazy(() => import('../pages/acerca/page'));
const NotFoundPage = lazy(() => import('../pages/NotFound'));

const routes: RouteObject[] = [
  {
    path: '/',
    element: <StoreSelectionPage />
  },
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/promociones',
    element: <PromocionesPage />
  },
  {
    path: '/mis-pedidos',
    element: <MisPedidosPage />
  },
  {
    path: '/mi-direccion',
    element: <MiDireccionPage />
  },
  {
    path: '/superadmin',
    element: <SuperAdminPage />
  },
  {
    path: '/menu',
    element: <MenuPage />
  },
  {
    path: '/checkout',
    element: <CheckoutPage />
  },
  {
    path: '/admin',
    element: <AdminPage />
  },
  {
    path: '/admin/whatsapp-qr/:storeId',
    element: <WhatsAppQRPage />
  },
  {
    path: '/orders',
    element: <OrdersPage />
  },
  {
    path: '/delivery',
    element: <DeliveryPage />
  },
  {
    path: '/track/:token',
    element: <TrackingPage />
  },
  {
    path: '/menu-management',
    element: <MenuManagementPage />
  },
  {
    path: '/privacidad',
    element: <PrivacyPage />
  },
  {
    path: '/invitar',
    element: <InvitarPage />
  },
  {
    path: '/success',
    element: <PaymentSuccessPage />
  },
  {
    path: '/failure',
    element: <PaymentFailurePage />
  },
  {
    path: '/pending',
    element: <PaymentPendingPage />
  },
  {
    path: '/stock-issue/:token',
    element: <StockIssuePage />
  },
  {
    path: '/order-success',
    element: <OrderSuccessPage />
  },
  {
    path: '/perfil',
    element: <PerfilPage />
  },
  {
    path: '/notificaciones',
    element: <NotificacionesPage />
  },
  {
    path: '/referidos',
    element: <ReferidosPage />
  },
  {
    path: '/cupones',
    element: <CuponesPage />
  },
  {
    path: '/favoritos',
    element: <FavoritosPage />
  },
  {
    path: '/direcciones',
    element: <DireccionesPage />
  },
  {
    path: '/ayuda',
    element: <AyudaPage />
  },
  {
    path: '/acerca',
    element: <AcercaPage />
  },
  {
    path: '*',
    element: <NotFoundPage />
  }
];

export default routes;
