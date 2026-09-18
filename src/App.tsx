import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { RouteError } from '@/components/layout/RouteError';
import { Toaster } from '@/components/ui/sonner'
import { AccountPage } from '@/pages/AccountPage'
import { ActivityPage } from '@/pages/ActivityPage'
import { BudgetPage } from '@/pages/BudgetPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { DataPage } from '@/pages/DataPage'
import { GroupPage } from '@/pages/GroupPage'
import { HomePage } from '@/pages/HomePage'
import { JoinPage } from '@/pages/JoinPage'
import { MorePage } from '@/pages/MorePage'
import { PaymentMethodsPage } from '@/pages/PaymentMethodsPage'
import { PeoplePage } from '@/pages/PeoplePage'
import { PersonPage } from '@/pages/PersonPage'
import { RecurringPage } from '@/pages/RecurringPage'
import { SettingsPage } from '@/pages/SettingsPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'people', element: <PeoplePage /> },
      { path: 'people/:id', element: <PersonPage /> },
      { path: 'more', element: <MorePage /> },
      { path: 'budget', element: <BudgetPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'payment-methods', element: <PaymentMethodsPage /> },
      { path: 'recurring', element: <RecurringPage /> },
      { path: 'data', element: <DataPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'groups/:id', element: <GroupPage /> },
      { path: 'join/:token', element: <JoinPage /> },
      {
        path: 'import',
        lazy: async () => ({ Component: (await import('@/pages/ImportPage')).ImportPage }),
      },
    ],
  },
])

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }} closeButton={false} />
    </>
  )
}
