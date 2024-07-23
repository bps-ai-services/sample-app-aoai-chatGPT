import React, { Suspense, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter, Route, Routes, useLocation, useNavigate, useNavigation } from 'react-router-dom'
import { initializeIcons } from '@fluentui/react'

import Chat from './pages/chat/Chat'
import Layout from './pages/layout/Layout'
import NoPage from './pages/NoPage'
import { AppStateProvider } from './state/AppProvider'

import './index.css'
import InputLevel2 from './components/Home/InputLevel2'
const Recommendations = React.lazy(() => import('./components/Recommendations/Recommendations'));
const ProductInformation = React.lazy(() => import('./components/ProductInformation/ProductInformation'));
const Feedback = React.lazy(() => import('./components/Feedback/Feedback'));
import PreventBackNavigation from './components/common/PreventBackNavigation'
import MSClarityScript from './msclaritytag'
import { AuthenticationResult, EventType, PublicClientApplication } from '@azure/msal-browser';
import { AuthenticatedTemplate, MsalProvider, UnauthenticatedTemplate, useIsAuthenticated } from '@azure/msal-react';
import { useMsal, useMsalAuthentication } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';
import SplashScreen from './components/SplashScreen'
import logo from "../src/assets/logo.png"
import { callMsGraph } from './graph'
//import UserInfo from './components/UserInformation/UserInfo'
import Home from './components/Home/Home'
import { graphConfig, loginRequest } from './authConf'
import MsalProviderWrapper from './MsalProviderWrapper'

initializeIcons()

interface UserInfo {
  city: string;
  state: string;
  user_ad_id : string;
}

export default function App() {

  useMsalAuthentication(InteractionType.Redirect);

  // const [showSplash, setShowSplash] = useState(true);
  // const handleTimeout = () => {
  //   setShowSplash(false);
  // };

  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  //const [userProfile, setUserProfile] = useState(null);
  const navigate = useNavigate();
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [renderLast,setRenderLast]=useState(false)
  useEffect(() => {
    if (isAuthenticated) {
      instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0]
      })
        .then(response => {
          const accessToken = response.accessToken;

          const headers = new Headers();
          const bearer = `Bearer ${accessToken}`;

          headers.append("Authorization", bearer);

          const options = {
            method: "GET",
            headers: headers
          };

          fetch(graphConfig.graphMeEndpoint, options)
            .then(response => response.json())
            .then(data => {
              const storedUserInfoString = localStorage.getItem("userInfo") || "";

              if (storedUserInfoString) {
                let storedUserInfo: UserInfo[] = [];
                storedUserInfo = JSON.parse(storedUserInfoString) as UserInfo[];
                  const city = storedUserInfo[0].city || null;
                  const state = storedUserInfo[0].state || null;
                  const user_ad_id = storedUserInfo[0].user_ad_id || null;
                  let userInfo = [{ state: state, city: city , user_ad_id:user_ad_id}];
                  let userInfoString = JSON.stringify(userInfo);
                  localStorage.setItem("userInfo", userInfoString);
                  setRenderLast(true)
                  setLoginSuccess(true)
              }
              else {
                  const city = data.city  || null;
                  const state = data.state || data.province || null;
                  const user_ad_id = data.id || null;
                  let userInfo = [{ state: state, city: city , user_ad_id : user_ad_id}];
                  let userInfoString = JSON.stringify(userInfo);
                  localStorage.setItem("userInfo", userInfoString);
                  setRenderLast(true)

                  setLoginSuccess(true)
              }
            })
            .catch(error => console.log(error));
        })
        .catch(error => {
          console.error('Token acquisition failed:', error);
        });
    }
    // }, [isAuthenticated, instance, accounts, navigate]);
  }, [isAuthenticated, instance, accounts]);

  // const { accounts } = useMsal();
  // const username = accounts[0] ? accounts[0].username : "";


  // const GA_TRACKING_ID = 'G-L0S6VRT5BT'; // Replace with your Google Analytics tracking ID
  // useEffect(() => {
  //   ReactGA.initialize(GA_TRACKING_ID);
  //   // Send pageview with a custom path
  //   ReactGA.send({ hitType: "pageview", page: window.location.pathname });
  // }, [])

  return (
    <AppStateProvider>
      <MSClarityScript />

      <PreventBackNavigation />
      <Suspense fallback={<div></div>}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={renderLast &&<Chat loginState={loginSuccess} />} />
            <Route path='inputLevel2' element={<InputLevel2 />} />
            <Route path='recommendations' element={<Recommendations />} />
            <Route path='productInfo' element={<ProductInformation />} />
            <Route path='feedback' element={<Feedback />} />
            <Route path="*" element={<NoPage />} />
          </Route>
        </Routes>
      </Suspense>

    </AppStateProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  // <React.StrictMode>
  <MsalProviderWrapper>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </MsalProviderWrapper>
  // </React.StrictMode>
)
