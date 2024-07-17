import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router-dom'
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
import ReactGA from 'react-ga4';
import MSClarityScript from './msclaritytag'

import { PublicClientApplication } from '@azure/msal-browser';
import { loginRequest, msalConfig } from './authConfig'
// import { MsalProvider } from '@azure/msal-react';
// import { useMsal, useMsalAuthentication } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';
import { MsalProvider, useMsal, AuthenticatedTemplate, UnauthenticatedTemplate, useIsAuthenticated, useMsalAuthentication } from '@azure/msal-react';

const msalInstance = new PublicClientApplication(msalConfig);

initializeIcons()

export default function App() {

  useMsalAuthentication(InteractionType.Redirect);
  const { accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const username = isAuthenticated && accounts[0] ? accounts[0].username : "";
  
  // const GA_TRACKING_ID = 'G-L0S6VRT5BT'; // Replace with your Google Analytics tracking ID
  
  // useEffect(() => {
  //   ReactGA.initialize(GA_TRACKING_ID);
  //   // Send pageview with a custom path
  //   ReactGA.send({ hitType: "pageview", page: window.location.pathname });
  // }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      msalInstance.loginRedirect(loginRequest);
    }
  }, [isAuthenticated, accounts]);

    
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
      {isAuthenticated && (
          <div className="user-info">
            User: {msalInstance.getAllAccounts()[0]?.username}
          </div>
        )}

    </AppStateProvider>
  )
}


ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  // <React.StrictMode>
  <MsalProvider instance={msalInstance}>

    <App />
  </MsalProvider>
  // </React.StrictMode>
)
