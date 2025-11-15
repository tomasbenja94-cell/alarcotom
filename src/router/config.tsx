
import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';

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
const NotFoundPage = lazy(() => import('../pages/NotFound'));

const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />
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
    path: '*',
    element: <NotFoundPage />
  }
];

export default routes;
