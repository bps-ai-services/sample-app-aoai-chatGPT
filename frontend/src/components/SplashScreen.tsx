import React, { useContext, useEffect } from 'react';
import { Text } from '@fluentui/react';
import './SplashScreen.css';
import { AppStateContext } from '../state/AppProvider';

interface SplashScreenProps {
    logo: string;
    loadingText?: string;
    duration: number;
    onTimeout: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ logo, loadingText = '', duration, onTimeout }) => {
    const appStateContext = useContext(AppStateContext)
    const { boat_specialist_api_version, client_app_version } = appStateContext?.state.frontendSettings ?? { boat_specialist_api_version: undefined, client_app_version: undefined }
    console.log('fe_config', { boat_specialist_api_version, client_app_version })

    useEffect(() => {
        const timer = setTimeout(onTimeout, duration);
        return () => clearTimeout(timer);
    }, [duration, onTimeout]);

    return (
        <div className="splash-screen">
            <img src={logo} alt="Logo" className="logo" />
            <div className='version-container'>
                <Text className='version-text'>
                    {`API Version: ${boat_specialist_api_version ?? '1.0.0'}`}
                </Text>
                <Text className='version-text'>
                    {`UI Version: ${client_app_version ?? '1.0.0'}`}
                </Text>
            </div>
        </div>
    );
};

export default SplashScreen;

