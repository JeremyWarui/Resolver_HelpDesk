import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { RoleProvider } from './lib/auth/roleContext.tsx'
import { wsInit } from './lib/ws/wsClient.ts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
})

// Inject queryClient into WS client so invalidation fires on real-time events
wsInit((key) => queryClient.invalidateQueries({ queryKey: key as readonly unknown[] }))

createRoot(document.getElementById('root')!).render(
  // Note: StrictMode disabled to prevent duplicate API calls in development
  // Re-enable for debugging: <StrictMode><App /></StrictMode>
  <QueryClientProvider client={queryClient}>
    <RoleProvider>
      <App />
    </RoleProvider>
  </QueryClientProvider>
)
