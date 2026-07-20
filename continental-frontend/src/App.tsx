import type { JSX } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './components/Login/Login'
import { LoginEmployee } from './components/Login/LoginEmployee'
import { ForgotPassword } from './components/Login/ForgotPassword'
import { ResetPassword } from './components/Login/ResetPassword'
import AdminDashboard from './components/Dashboard-Admin/AdminDashboard'
import AreaDashboard from './components/Dashboard-Area/AreaDashboard'
import EmployeeDashboard from './components/Dashboard-Empleados/EmployeeDashboard.tsx'
import ProtectedRoute from './components/routes/ProtectedRoute.tsx'
import { DebugPanel } from './components/Debug/DebugPanel'
import { UserRole } from './interfaces/User.interface'
import { Toaster } from 'sonner'
import { SolicitarSuplente } from './components/Suplente/SolicitarSuplente'
import { Notificaciones } from './components/Notificaciones/Notificaciones'
import { SessionProvider } from './contexts/SessionContext'
import { EmpleadosProvider } from './contexts/EmpleadosContext'

function App(): JSX.Element {
  return (
    <Router>
      <SessionProvider>
        <EmpleadosProvider cacheTTL={10}>
          <div className="min-h-screen w-full">
            <Toaster richColors position='top-center' />
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/login-vacaciones" element={<LoginEmployee />} />
              {/* recuperar contraseña */}
              <Route path="/restablecer-acceso" element={<ForgotPassword />} />
              <Route path="/restablecer-acceso/:token" element={<ResetPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              
              {/* Protected Dashboard Routes */}
              <Route path="/admin/*" element={
                <ProtectedRoute requiredRole={[UserRole.SUPER_ADMIN]}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              
              <Route path="/area/*" element={
                <ProtectedRoute requiredRole={[UserRole.AREA_ADMIN, UserRole.LEADER, UserRole.INDUSTRIAL, UserRole.GERENTE_BT, UserRole.RH]}>
                  <AreaDashboard />
                </ProtectedRoute>
              } />
              
              <Route path="/empleados/*" element={
                <ProtectedRoute requiredRole={[UserRole.UNION_REPRESENTATIVE, UserRole.UNIONIZED]}>
                  <EmployeeDashboard />
                </ProtectedRoute>
              } />
              
              {/* Ruta independiente para Suplente */}
              <Route path="/suplente" element={
                <ProtectedRoute requiredRole={[UserRole.SUPER_ADMIN, UserRole.AREA_ADMIN, UserRole.INDUSTRIAL]}>
                  <SolicitarSuplente />
                </ProtectedRoute>
              } />
              
              {/* Ruta independiente para Notificaciones */}
              <Route path="/notificaciones" element={
                <ProtectedRoute requiredRole={[ UserRole.SUPER_ADMIN, UserRole.AREA_ADMIN, UserRole.LEADER, UserRole.INDUSTRIAL, UserRole.UNION_REPRESENTATIVE]}>
                  <Notificaciones />
                </ProtectedRoute>
              } />
            </Routes>
            
            {/* Debug Panel - Only visible in development */}
            <DebugPanel />
          </div>
        </EmpleadosProvider>
      </SessionProvider>
    </Router>
  )
}

export default App