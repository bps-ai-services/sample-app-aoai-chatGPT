import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { initializeIcons } from '@fluentui/react'

import Chat from './pages/chat/Chat'
import Layout from './pages/layout/Layout'
import NoPage from './pages/NoPage'
import { AppStateProvider } from './state/AppProvider'

import './index.css'
import InputLevel2 from './components/Home/InputLevel2'
import Recommendations from './components/Recommendations/Recommendations'
import ProductInformation from './components/ProductInformation/ProductInformation'
import Feedback from './components/Feedback/Feedback'
import PreventBackNavigation from './components/common/PreventBackNavigation'
import MSClarityScript from './msclaritytag'

import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './authConfig'
import { MsalProvider } from '@azure/msal-react';
import { useMsal, useMsalAuthentication } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';

const msalInstance = new PublicClientApplication(msalConfig);

initializeIcons()

export default function App() {

  useMsalAuthentication(InteractionType.Redirect);
  const { accounts } = useMsal();
  const username = accounts[0] ? accounts[0].username : "";

  return (
    <AppStateProvider>
      <MSClarityScript />
      <BrowserRouter>
        <PreventBackNavigation />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Chat />} />
            <Route path='inputLevel2' element={<InputLevel2 />} />
            <Route path='recommendations' element={<Recommendations />} />
            <Route path='productInfo' element={<ProductInformation />} />
            <Route path='feedback' element={<Feedback />} />
            <Route path="*" element={<NoPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      {username && (
        <div className="user-info">
          User: {username}
        </div>
      )}
    </AppStateProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <MsalProvider instance={msalInstance}>
    <App />
  </MsalProvider>
)
