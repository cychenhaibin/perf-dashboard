import { Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { useBaseUrl } from "@/hooks/use-base-url"
import { ConfigurePage } from "@/pages/configure"
import { DashboardPage } from "@/pages/dashboard"

export default function App() {
  const baseUrl = useBaseUrl()

  return (
    <>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route
          path="/"
          element={
            baseUrl ? <DashboardPage /> : <Navigate to="/configure" replace />
          }
        />
        <Route path="/configure" element={<ConfigurePage />} />
        <Route
          path="*"
          element={
            baseUrl ? <DashboardPage /> : <Navigate to="/configure" replace />
          }
        />
      </Routes>
    </>
  )
}
