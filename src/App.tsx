import { PlannerProvider } from './hooks/usePlannerStore'
import { AppShell } from './components/layout/AppShell'

export default function App() {
  return (
    <PlannerProvider>
      <AppShell />
    </PlannerProvider>
  )
}
