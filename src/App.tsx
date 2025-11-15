
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './router'
import ToastContainer from './components/feature/ToastContainer'
import ErrorBoundary from './components/base/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={__BASE_PATH__}>
        <AppRoutes />
        <ToastContainer />
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
