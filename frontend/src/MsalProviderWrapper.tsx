// src/MsalProviderWrapper.tsx
import React, { useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./authConf";
 
const msalInstance = new PublicClientApplication(msalConfig);
 
const MsalProviderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
 
  useEffect(() => {
    const initializeMsal = async () => {
      try {
        await msalInstance.initialize();
        setIsInitialized(true);
      } catch (error) {
        console.error("MSAL initialization error:", error);
      }
    };
 
    initializeMsal();
  }, []);
 
  if (!isInitialized) {
    return <p></p>;
  }
 
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
};
 
export default MsalProviderWrapper;