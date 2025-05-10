/*
Конфигурационный файл с параметрами по умолчанию.
*/

export const defaultSteering = { min: 45, max: 135, invert: true };

export const bluetoothConfig = {
  serviceId: 0xFFE0,
  charTxId:   0xFFE1
};

export const timingConfig = {
  sendIntervalMs:   100,
  maxQueueLength:   5
};

export const batteryConfig = {
  minVoltage: 9.0,
  maxVoltage: 12.6,
  adcMultiplier:    0.0003,
  batteryMultiplier: 11
};

export const defaultCenterSteering = true;
export const defaultSwapControls = false;
export const defaultReverse = true;
export const defaultEchoThreshold      = 34;
export const defaultDisconnectTimeout  = 1000;
export const defaultTheme = 'dark';