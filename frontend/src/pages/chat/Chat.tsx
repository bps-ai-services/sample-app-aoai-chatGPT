import { useRef, useState, useEffect, useContext, useLayoutEffect } from 'react'
import { Stack } from '@fluentui/react'
import { ShieldLockRegular } from '@fluentui/react-icons'

import { v4 as uuid } from 'uuid'

import styles from './Chat.module.css'
import logo from "../../assets/logo.png"
import {
  ChatMessage,
  getUserInfo,
  historyUpdate,
  ChatHistoryLoadingState,
  CosmosDBStatus
} from "../../api";
import { AppStateContext } from "../../state/AppProvider";
import { useBoolean } from "@fluentui/react-hooks";
import Home from '../../components/Home/Home'
import SplashScreen from '../../components/SplashScreen'
import UserInfo from '../../components/UserInformation/UserInfo'

const enum messageStatus {
  NotRunning = 'Not Running',
  Processing = 'Processing',
  Done = 'Done'
}
interface UserInfo {
  id: string;
  name: string;
}
interface Props {
  loginState:boolean
}
const Chat:React.FC<Props>= ({loginState=false}) => {
  //console.log({loginState})
  const appStateContext = useContext(AppStateContext)
  const AUTH_ENABLED = appStateContext?.state.frontendSettings?.auth_enabled
  const chatMessageStreamEnd = useRef<HTMLDivElement | null>(null)
  const [showAuthMessage, setShowAuthMessage] = useState<boolean | undefined>()
  const [processMessages, setProcessMessages] = useState<messageStatus>(messageStatus.NotRunning)
  const [hideErrorDialog, { toggle: toggleErrorDialog }] = useBoolean(true)
  const [userInfo, setUserInfo] = useState<UserInfo[]>([]);

  const [ERROR] = ['error']
  const NO_CONTENT_ERROR = 'No content in messages object.'
  const [loading, setLoading] = useState(true);

  

  useEffect(() => {
    if (
      appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.Working &&
      appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured &&
      appStateContext?.state.chatHistoryLoadingState === ChatHistoryLoadingState.Fail &&
      hideErrorDialog
    ) {
      toggleErrorDialog()
    }
  }, [appStateContext?.state.isCosmosDBAvailable])

  const getUserInfoList = async () => {
    if (!AUTH_ENABLED) {
      setShowAuthMessage(false)
      return
    }
    const userInfoList = await getUserInfo()
    if (userInfoList.length === 0 && window.location.hostname !== '127.0.0.1') {
      setShowAuthMessage(true)
    } else {
      setShowAuthMessage(false)
    }
  }

  useLayoutEffect(() => {
    const saveToDB = async (messages: ChatMessage[], id: string) => {
      const response = await historyUpdate(messages, id)
      return response
    }

    if (appStateContext && appStateContext.state.currentChat && processMessages === messageStatus.Done) {
      if (appStateContext.state.isCosmosDBAvailable.cosmosDB) {
        if (!appStateContext?.state.currentChat?.messages) {
          console.error('Failure fetching current chat state.')
          return
        }
        const noContentError = appStateContext.state.currentChat.messages.find(m => m.role === ERROR)

        if (!noContentError?.content.includes(NO_CONTENT_ERROR)) {
          saveToDB(appStateContext.state.currentChat.messages, appStateContext.state.currentChat.id)
            .then(res => {
              if (!res.ok) {
                let errorMessage =
                  "An error occurred. Answers can't be saved at this time. If the problem persists, please contact the site administrator."
                let errorChatMsg: ChatMessage = {
                  id: uuid(),
                  role: ERROR,
                  content: errorMessage,
                  date: new Date().toISOString()
                }
                if (!appStateContext?.state.currentChat?.messages) {
                  let err: Error = {
                    ...new Error(),
                    message: 'Failure fetching current chat state.'
                  }
                  throw err
                }
              }
              return res as Response
            })
            .catch(err => {
              console.error('Error: ', err)
              let errRes: Response = {
                ...new Response(),
                ok: false,
                status: 500
              }
              return errRes
            })
        }
      } else {
      }
      appStateContext?.dispatch({ type: 'UPDATE_CHAT_HISTORY', payload: appStateContext.state.currentChat })
      setProcessMessages(messageStatus.NotRunning)
    }
  }, [processMessages])

  useEffect(() => {
    if (AUTH_ENABLED !== undefined) getUserInfoList()
  }, [AUTH_ENABLED])

  useLayoutEffect(() => {
    chatMessageStreamEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [processMessages])

  const [showSplash, setShowSplash] = useState(true);

  const handleTimeout = () => {
    setShowSplash(!loginState);
  };

  // useEffect(() => {
  //   const userInfoFromLocalStorage = localStorage.getItem('userInfo');
  //   if (userInfoFromLocalStorage) {
  //     setUserInfo(JSON.parse(userInfoFromLocalStorage));
  //   }
  //   setLoading(false); // Update loading state after fetching
  // }, []);
  // useEffect(() => {
  //   const userInfoFromLocalStorage = localStorage.getItem('userInfo');
  //   if (userInfoFromLocalStorage) {
  //     setUserInfo(JSON.parse(userInfoFromLocalStorage));

  //   }
  // }, [])
  const [isDatainLocalStorage,setIsDataInLocalStorage]=useState(null)
  useEffect(()=>{
    const storeuserinfo=localStorage.getItem("userInfo");
    let storageval;
    if(storeuserinfo){
        storageval=JSON.parse(storeuserinfo);

        setIsDataInLocalStorage(storageval[0].city)
    } 

  },[])
  console.log({isDatainLocalStorage})

  console.log("userInfo ->chat", userInfo)
  return (
    <div className={styles.container} role="main">
      {showAuthMessage ? (
        <Stack className={styles.chatEmptyState}>
          <ShieldLockRegular
            className={styles.chatIcon}
            style={{ color: 'darkorange', height: '200px', width: '200px' }}
          />
          <h1 className={styles.chatEmptyStateTitle}>Authentication Not Configured</h1>
          <h2 className={styles.chatEmptyStateSubtitle}>
            This app does not have authentication configured. Please add an identity provider by finding your app in the{' '}
            <a href="https://portal.azure.com/" target="_blank">
              Azure Portal
            </a>
            and following{' '}
            <a
              href="https://learn.microsoft.com/en-us/azure/app-service/scenario-secure-app-authentication-app-service#3-configure-authentication-and-authorization"
              target="_blank">
              these instructions
            </a>
            .
          </h2>
          <h2 className={styles.chatEmptyStateSubtitle} style={{ fontSize: '20px' }}>
            <strong>Authentication configuration takes a few minutes to apply. </strong>
          </h2>
          <h2 className={styles.chatEmptyStateSubtitle} style={{ fontSize: '20px' }}>
            <strong>If you deployed in the last 10 minutes, please wait and reload the page after 10 minutes.</strong>
          </h2>
        </Stack>
      ) : (
        <div className={styles.chatContainer}>
          {!loginState ? (
            <SplashScreen logo={logo} duration={500} onTimeout={handleTimeout} />
          ) : (
            <>
              {isDatainLocalStorage!==null ? (
                <Home />
              ) : (
                <UserInfo />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default Chat
