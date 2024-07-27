import React, { useContext, useEffect, useState } from 'react';
import { IIconProps, Icon, PrimaryButton, Stack, Text, css } from '@fluentui/react';
import WalkAround from './WalkAround';
import FlashCard from './FlashCard';
import styles from '../../pages/chat/Chat.module.css'
import { useNavigate } from 'react-router-dom';
import {
  Library16Filled,
  Library24Filled,
  Library28Filled,
  VehicleShip16Filled,
  VehicleShip24Filled
} from '@fluentui/react-icons'
import { AppStateContext } from '../../state/AppProvider';
import { templete2, templete3 } from '../../constants/templete';
import { getValuePropositions, getWalkthroughData } from '../../api';
import BackButton from '../BackButton';
import style from './ProductInfo.module.css';
import PrimaryButtonComponent from '../common/PrimaryButtonComponent';

const ProductInformation: React.FC = () => {
  const [selectedOption, setSelectedOption] = useState<string>('FlashCard');
  const navigate = useNavigate();
  const appStateContext = useContext(AppStateContext);
  const selectedboat = appStateContext?.state?.selectedBoat;
  const selectedbrand = appStateContext?.state?.selectedBrand;
  const conversationId = appStateContext?.state?.conversationId;
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const isLoading = appStateContext?.state?.isLoadingValuePropositions
  const walkthroughData = appStateContext?.state?.walkthorugh;
  const valuesProps = appStateContext?.state?.valuePropositions
  const promptValue = appStateContext?.state?.promptvalue;
  const traitsValue = appStateContext?.state?.traits;

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);

    window.addEventListener('resize', handleResize);

    // Cleanup the event listener on component unmount
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderLibraryIcon = () => {
    if (screenWidth <= 1000) {
      return <Library16Filled />;
    } else if (screenWidth > 1000 && screenWidth <= 2500) {
      return <Library28Filled />;
    }
  };
  const renderBoatIcon = () => {
    if (screenWidth <= 1000) {
      return <VehicleShip16Filled />;
    } else if (screenWidth > 1000 && screenWidth <= 2500) {
      return <VehicleShip24Filled />;
    }
  };


  const fetch = async () => {
    try {
      appStateContext?.dispatch({ type: 'SET_VALUE_PROPOSITION_LOADING', payload: true })
      appStateContext?.dispatch({ type: 'SET_WALKTHROUGH_LOADING', payload: true })

      const boatBrandModel = `${selectedbrand} ${selectedboat}`;
      const valuePropositionsResponse = await getValuePropositions(templete2(selectedboat || "", selectedbrand || ""), conversationId || "", boatBrandModel, traitsValue || "")

      if (valuePropositionsResponse) {
        const parsedDataValueProps = JSON.parse(valuePropositionsResponse?.messages);
        const valuePropositions = parsedDataValueProps
        appStateContext?.dispatch({ type: 'SET_VALUE_PROPOSITION_STATE', payload: valuePropositions })
      }
      const walkaroundResponse = await getWalkthroughData(templete3(selectedboat || "", selectedbrand || ""), conversationId || "")

      if (walkaroundResponse) {
        try {
          const parsedData = JSON.parse(walkaroundResponse.messages);
          const walkThrough = JSON.parse(parsedData.result);
          appStateContext?.dispatch({ type: 'SET_WALKTHROUGH_STATE', payload: walkThrough });
        } catch (error) {
          console.error('Error parsing JSON:', error);
        }
      }

    } catch (error) {
      appStateContext?.dispatch({ type: 'SET_VALUE_PROPOSITION_LOADING', payload: false })
      appStateContext?.dispatch({ type: 'SET_WALKTHROUGH_LOADING', payload: false })
    }
  }

  useEffect(() => {
    fetch();
  }, [])

  const handleOptionClick = (option: string) => {
    setSelectedOption(option);
  };

  const handleNextClick = () => {
    navigate('/feedback');
  };

  const iconStyles: IIconProps = {
    iconName: 'Library',
    styles: {
      root: {
        '@media (max-width: 600px)': {
          fontWeight: 'bold',
          fontSize: '16px'
        },
        '@media (max-width: 1000px) and (min-width: 600px)': {
          fontWeight: 'bold',
          fontSize: '28px'
        },
        '@media (max-width: 1500px) and (min-width: 1000px)': {
          fontWeight: 'bold',
          fontSize: '28px'
        },
        '@media (max-width: 2500px) and (min-width: 1500px)': {
          fontSize: '30px'
        },
        color: selectedOption !== "FlashCard" ? '#9A9A90' : "#FFFFFF",
        cursor: 'pointer'
      }
    }
  }

  return (
    // <div className={styles.chatContainer}>
    <Stack className={style.mainStackContainer}>
      <Stack className={style.headerMainStackContainer}>
        <Stack className={style.headerStackContainer}>
          <div className={style.headingDiv}>
            <div className={style.backButton}>
              <BackButton onClick={() => navigate('/recommendations')}></BackButton>
            </div>
            <Text
              className={style.headingText}>{`${selectedbrand}-${selectedboat}`}</Text>
          </div>
          <Stack
            horizontal
            tokens={{ childrenGap: 10 }}
            style={{ width: '100%', padding: '0px', marginTop: 15 }}
          >
            <PrimaryButton
              onClick={() => handleOptionClick('FlashCard')}
              styles={{
                root: {
                  width: '50%',
                  '@media (max-width: 600px)': {
                    height: '40px'
                  },
                  height: '50px',
                  background: `${selectedOption === 'FlashCard' ? "#202A2F !important" : "transparent"}`,
                  borderRadius: 10,
                  boxShadow: 'none',
                  border: '2px solid #1d262a !important',
                  selectors: {
                    ':hover': {
                      background: '#1d262a !important'
                    },
                    ':active': {
                      background: '#1d262a !important'
                    },
                    ':focus': {
                      background: '#1d262a !important'
                    }
                  }
                }
              }}>
              <Icon {...iconStyles} />
              <Text
                styles={{
                  root: {
                    '@media (max-width: 600px)': {
                      fontSize: '14px',
                      fontWeight: '600'
                    },
                    fontSize: '20px',
                    fontWeight: '600'
                  }
                }}
                style={{
                  color: selectedOption === 'FlashCard' ? '#FFF' : '#9A9A90',
                  marginLeft: 10,
                  lineHeight: '20px',
                  fontStyle: 'normal'
                }}>
                {'Value Props'}
              </Text>
            </PrimaryButton>
            <PrimaryButton
              onClick={() => handleOptionClick('WalkAround')}
              styles={{
                root: {
                  '@media (max-width: 600px)': {
                    height: '40px'
                  },
                  height: '50px',
                  width: '50%',
                  background: `${selectedOption === 'WalkAround' ? "#202A2F !important" : "transparent"}`,
                  borderRadius: 10,
                  border: '2px solid #1d262a !important',
                  color: '#FFFFFF',
                  boxShadow: 'none',
                  selectors: {
                    ':hover': {
                      background: '#1d262a !important'
                    },
                    ':active': {
                      background: '#1d262a !important'
                    },
                    ':focus': {
                      background: '#1d262a !important'
                    }
                  }
                }
              }}>
              {renderBoatIcon()}
              <Text
                styles={{
                  root: {
                    '@media (max-width: 600px)': {
                      fontSize: '14px',
                      fontWeight: '600'
                    },
                    fontSize: '20px',
                    fontWeight: '600'
                  }
                }}
                style={{ color: selectedOption === 'WalkAround' ? '#FFF' : '#9A9A90', marginLeft: 10 }}>
                {'Walk Around'}
              </Text>
            </PrimaryButton>
          </Stack>
        </Stack>
      </Stack>
      <Stack
        className={selectedOption === 'WalkAround' ? style.contentStackContainerWalkthrough : style.contentMainStackContainer}
        style={{ justifyContent: valuesProps?.length === 0 || isLoading || selectedOption !== 'WalkAround' ? "center" : "" }}
      >
        <Stack
          className={selectedOption !== 'WalkAround' ? style.contentStackContainer : style.walkThroughStackContainer}
        >
          {selectedOption === 'WalkAround' ? <WalkAround /> : <FlashCard />}
        </Stack>
      </Stack>
      <Stack className={style.footerMainStackContainer} >
        <Stack
          className={style.footerStackContainer}>
          <PrimaryButtonComponent label="I'm Done" onClick={handleNextClick} disabled={isLoading || false} />
        </Stack>
      </Stack>
    </Stack>
    // </div>
  );
};

export default ProductInformation;