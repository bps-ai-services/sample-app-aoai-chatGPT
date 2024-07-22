import * as React from 'react';
import { Stack, TextField, IconButton, PrimaryButton, ComboBox, IComboBoxOption, IComboBox } from '@fluentui/react';
//import { v4 as uuid } from 'uuid';
import style from "../../pages/layout/Layout.module.css"
import { Send24Filled, Send28Filled } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
//import { getCities, getStates } from '../../api';
import CityAutocompleteInput from '../common/CityAutoComplete';
import PrimaryButtonComponent from '../common/PrimaryButtonComponent';
import { useNavigate } from 'react-router-dom';

const UserInfo: React.FC = () => {
  const [states, setStates] = useState<IComboBoxOption[]>([]);
  const [cities, setCities] = useState<IComboBoxOption[]>([]);
  const [selectedState, setSelectedState] = useState<string | undefined>();
  
  const textFieldStyle: React.CSSProperties = {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'inherit',
  };

  const textFieldWrapperStyle: React.CSSProperties = {
    flex: 1,
    borderRadius: '25px',
  };

  const comboBoxStyle: React.CSSProperties = {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'inherit',
  };

  const [inputValue, setInputValue] = React.useState<string>('');

  const handleChange = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
    setInputValue(newValue || "")
  }

  const handleSave = () => {
    let cityname = ""
    let statename = ""
    const StateCity = inputValue.split(',');
    cityname = StateCity[0]  || ""
    statename = StateCity[1] || ""

    const dataToSave = { state : statename, city: cityname};
    console.log("dataToSave", dataToSave)

    localStorage.setItem('userInfo', JSON.stringify([dataToSave]));
    if (inputValue !== "") {
      window.location.reload();
    }

  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      handleSave?.();
    }
  };

  // useEffect(() => {
  //   // Fetch states from the backend
  //   const fetchStates = async () => {
  //     var fetchedStates = await getStates();
  //     setStates(fetchedStates.map((state: string) => ({ key: state, text: state })));
  //   };

  //   fetchStates();
  // }, []);

  // const handleStateChange = async (event: React.FormEvent<IComboBox>, option?: IComboBoxOption) => {
  //   if (option) {
  //     setSelectedState(option.key as string);
  //     // Fetch cities based on the selected state
  //     const cities = await getCities(option.key);
  //     setCities(cities.map((city: string) => ({ key: city, text: city })));
  //   }
  // };

  const suggestions = [
    "DANIA BEACH, Florida",
    "JACKSONVILLE, Florida",
    "ORLANDO, Florida",
    "DESTIN, Florida",
    "BRADENTON, Florida",
    "FORT MYERS, Florida",
    "MIAMI, Florida",
    "PORT ST. LUCIE, Florida",
    "TALLAHASSEE, Florida",
    "PALM BAY, Florida",
    "TAMPA, Florida",
    "GAINESVILLE, Florida",
    "DAYTONA, Florida",
    "ISLAMORADA, Florida",
  ]

  return (
    <Stack horizontalAlign='center'
      tokens={{ childrenGap: 20 }}
      styles={{
        root: {
          width: "100%",
          margin: 'auto',
          height: "calc(100vh - 100px)",
          '@media (max-width: 600px)': {
            height: "calc(100vh - 70px)",
          },
          justifyContent: 'center'
        }
      }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
          width: "100%",
          gap: "10px",
          padding: "0px 20px"
        }}>
        <CityAutocompleteInput suggestions={suggestions} setSelectedValue={setInputValue} selectedValue={inputValue === ""} handleSave={handleSave} />
      </div>
    </Stack>
  );
};

export default UserInfo;