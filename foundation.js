/*
Файл с определением тем оформления, переводов для локализации,
параметров для конфигурации платформы.
*/

import {
  defaultEchoThreshold,
  defaultDisconnectTimeout
} from './config.js';

export const themes = {
    dark: {
      '--bg-color': '#333',
      '--text-color': '#fff',
      '--control-bg': '#444',
      '--button-bg': '#4CAF50',
      '--modal-bg': '#fff',
      '--modal-text': '#000',
      '--battery-bg': '#555',
      '--battery-color': '#fff'
    },
    light: {
      '--bg-color': '#f0f0f0',
      '--text-color': '#333',
      '--control-bg': '#ddd',
      '--button-bg': '#2196F3',
      '--modal-bg': '#fff',
      '--modal-text': '#000',
      '--battery-bg': '#ddd',
      '--battery-color': '#000'
    },
    midnight: {
      '--bg-color': '#111111',
      '--text-color': '#cccccc',
      '--control-bg': '#222222',
      '--button-bg': '#0077ff',
      '--modal-bg': '#1a1a1a',
      '--modal-text': '#cccccc',
      '--battery-bg': '#333333',
      '--battery-color': '#cccccc'
    },
  };


  export const translations = {
    en: {
      appTitle:           'Car Controller',
      installSection: 'Installation',
      installApp: 'Install App',
      connect:            'CONNECT',
      connected:          'CONNECTED',
      settings:           'Settings',
      themeLabel:         'Theme',
      languageSettings:   'Language',
      controlSettings:    'Control',
      thresholds:         'Cut-off thresholds',
      steeringSettings:   'Steering',
      save:               'Save',
      reset:              'Reset',
      throttle:           'THROTTLE',
      steering:           'STEERING',
      centerSteering:     'Center steering',
      swapControls:       'Steering joystick on left',
      reverseMode:        'Reverse mode',
      minAngle:           'Minimum angle',
      maxAngle:           'Maximum angle',
      invertSteering:     'Invert steering',
      modalTitle:         'Settings',
      errorMinMax:        'Min must be less than Max; both fields are required',
      errorParamRange:    (label, min, max) =>
                          `Field “${label}” must be an integer between ${min} and ${max}`,
      params: {
        echo_threshold:        'Object distance (cm)',
        disconnect_threshold:  'Command timeout (ms)',
      },
    },
  
    ru: {
      appTitle:           'Контроллер платформы',
      installSection: 'Установка',
      installApp: 'Установить приложение',
      connect:            'ПОДКЛЮЧИТЬ',
      connected:          'ПОДКЛЮЧЕНО',
      settings:           'Настройки',
      themeLabel:         'Тема оформления',
      languageSettings:   'Язык',
      controlSettings:    'Управление',
      thresholds:         'Пороги отключения двигателя',
      steeringSettings:   'Рулевое управление',
      save:               'Сохранить',
      reset:              'Сбросить',
      throttle:           'ТЯГА',
      steering:           'РУЛЬ',
      centerSteering:     'Центрировать руль',
      swapControls:       'Джойстик руля слева',
      reverseMode:        'Режим реверса',
      minAngle:           'Минимальный угол',
      maxAngle:           'Максимальный угол',
      invertSteering:     'Инвертировать руль',
      modalTitle:         'Настройки',
      errorMinMax:        'Мин < Макс, оба числа обязательны',
      errorParamRange:    (label, min, max) =>
                          `Поле «${label}» должно быть целым от ${min} до ${max}`,
      params: {
        echo_threshold:        'Расстояние до объекта (см)',
        disconnect_threshold:  'Таймаут отправки команд (мс)',
      },
    },
  };
  
  export const availableLanguages = Object.keys(translations);

  export const languages = {
    en: { code: 'en', nativeName: 'English' },
    ru: { code: 'ru', nativeName: 'Русский' },
  };

  export function t(lang, key, ...args) {
    const parts = key.split('.');
    let cur = translations[lang] || translations.en;
    for (const p of parts) {
      cur = cur?.[p];
      if (cur === undefined) break;
    }
    if (typeof cur === 'function') return cur(...args);
    return cur ?? key;
  }


  export const paramConfigs = {
    echo_threshold: {
      labelKey: 'params.echo_threshold',
      default:  defaultEchoThreshold,
      min:      0,
      max:      400,
      step:     1,
      multiplier: 58,
      cmd: 'e',
    },
    disconnect_threshold: {
      labelKey: 'params.disconnect_threshold',
      default:  defaultDisconnectTimeout,
      min:      100,
      max:      2000,
      step:     100,
      multiplier: 1,
      cmd: 'c',
    },
  };
  