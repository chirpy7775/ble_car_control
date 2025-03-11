'use strict';

(() => {

    const steeringConfig = {
        min: 45,         // Минимальный угол поворота
        max: 135,        // Максимальный угол поворота
        invert: true    // Инверсия направления управления
    };

    const bt_btn = document.getElementById('bt-btn');
    const steeringPad = document.getElementById('steering');
    const throttlePad = document.getElementById('throttle');
    const steeringValue = document.getElementById('steering-value');
    const throttleValue = document.getElementById('throttle-value');
    
    const steeringIndicator = steeringPad.querySelector('.indicator');
    const throttleIndicator = throttlePad.querySelector('.indicator');
    
    const bt_svc_id = 0xFFE0;
    const bt_char_tx_id = 0xFFE1;
    
    let bt_char = null;
    let sendInterval = null;
    let lastSteering = 90;
    let lastThrottle = 0;
    let isConnected = false;
    
    function updateSteering(x, y) {
        const rect = steeringPad.getBoundingClientRect();
        const posX = Math.max(0, Math.min(rect.width, x - rect.left));
        const relativePos = posX / rect.width;
        
        // Применяем инверсию если нужно
        const invertedPos = steeringConfig.invert ? (1 - relativePos) : relativePos;
        
        // Рассчитываем угол с учетом нового диапазона
        const angle = Math.round(
            steeringConfig.min + 
            invertedPos * (steeringConfig.max - steeringConfig.min)
        );
        
        steeringIndicator.style.left = `${posX}px`;
        steeringIndicator.style.top = `${rect.height/2}px`;
        steeringValue.textContent = `${angle}°`;
        lastSteering = angle;
    }
    
    function updateThrottle(x, y) {
        const rect = throttlePad.getBoundingClientRect();
        const posY = Math.max(0, Math.min(rect.height, y - rect.top));
        const percent = 100 - Math.round((posY / rect.height) * 100);
        
        throttleIndicator.style.left = `${rect.width/2}px`;
        throttleIndicator.style.top = `${posY}px`;
        throttleValue.textContent = `${percent}%`;
        lastThrottle = percent;
    }
    
    function resetThrottle() {
        throttleIndicator.style.left = '50%';
        throttleIndicator.style.top = '100%';
        throttleValue.textContent = '0%';
        lastThrottle = 0;
    }
    
    function handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch.target.closest('#steering')) {
            updateSteering(touch.clientX, touch.clientY);
        } else if (touch.target.closest('#throttle')) {
            updateThrottle(touch.clientX, touch.clientY);
        }
    }
    
    function handleTouchMove(e) {
        e.preventDefault();
        Array.from(e.touches).forEach(touch => {
            if (touch.target.closest('#steering')) {
                updateSteering(touch.clientX, touch.clientY);
            } else if (touch.target.closest('#throttle')) {
                updateThrottle(touch.clientX, touch.clientY);
            }
        });
    }
    
    function handleTouchEnd(e) {
        Array.from(e.changedTouches).forEach(touch => {
            if (touch.target.closest('#throttle')) {
                resetThrottle();
            }
        });
    }
    
    function txString(str) {
        if (!bt_char || !bt_char.properties.write) return;
        const val = new TextEncoder().encode(str + '\r');
        bt_char.writeValueWithoutResponse(val)
            .catch(err => console.log('Write error:', err));
    }
    
    let isSending = false;
    let commandQueue = [];
    let lastSendTime = 0;

    function processQueue() {
        if (!bt_char || commandQueue.length === 0 || isSending) return;
        
        isSending = true;
        const now = Date.now();
        const delay = Math.max(0, 1 - (now - lastSendTime));
        
        setTimeout(() => {
            const cmd = commandQueue.shift();
            const val = new TextEncoder().encode(cmd + '\r');
            
            bt_char.writeValueWithoutResponse(val)
                .then(() => {
                    lastSendTime = Date.now();
                    isSending = false;
                    if (commandQueue.length > 0) {
                        processQueue();
                    }
                })
                .catch(err => {
                    console.log('Write error:', err);
                    isSending = false;
                });
        }, delay);
    }

    function sendCommands() {
        // Очищаем очередь если было больше 5 команд в очереди
        if (commandQueue.length > 5) commandQueue = [];
        
        // Добавляем новые команды
        commandQueue.push(`s${lastSteering}`);
        commandQueue.push(`t${lastThrottle}`);
        
        // Запускаем обработку очереди
        processQueue();
    }
    
    function onConnected() {
        isConnected = true;
        bt_btn.textContent = 'CONNECTED';
        bt_btn.disabled = false;
        sendInterval = setInterval(sendCommands, 100);
    }
    
    function onDisconnected() {
        isConnected = false;
        bt_btn.textContent = 'CONNECT';
        clearInterval(sendInterval);
        resetThrottle();
        lastSteering = 90;
        steeringValue.textContent = '90°';
        steeringIndicator.style.left = '50%';
    }
    

    function handleMouseStart(e) {
        e.preventDefault();
        const target = e.target.closest('#steering, #throttle');
        if (!target) return;

        if (target.id === 'steering') {
            updateSteering(e.clientX, e.clientY);
        } else if (target.id === 'throttle') {
            updateThrottle(e.clientX, e.clientY);
        }

        function handleMouseMove(e) {
            e.preventDefault();
            if (target.id === 'steering') {
                updateSteering(e.clientX, e.clientY);
            } else if (target.id === 'throttle') {
                updateThrottle(e.clientX, e.clientY);
            }
        }

        function handleMouseUp(e) {
            e.preventDefault();
            if (target.id === 'throttle') {
                resetThrottle();
            }
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    // Обновляем инициализацию начального положения
    const initialSteering = Math.round((steeringConfig.min + steeringConfig.max) / 2);
    lastSteering = initialSteering;
    steeringValue.textContent = `${initialSteering}°`;

    function onDisconnected() {
        isConnected = false;
        bt_btn.textContent = 'CONNECT';
        clearInterval(sendInterval);
        resetThrottle();
        
        // Сбрасываем руль в среднее положение согласно конфигу
        lastSteering = Math.round((steeringConfig.min + steeringConfig.max) / 2);
        steeringValue.textContent = `${lastSteering}°`;
        steeringIndicator.style.left = '50%';
    }

    steeringPad.addEventListener('mousedown', handleMouseStart);
    throttlePad.addEventListener('mousedown', handleMouseStart);


    steeringPad.addEventListener('touchstart', handleTouchStart);
    steeringPad.addEventListener('touchmove', handleTouchMove);
    throttlePad.addEventListener('touchstart', handleTouchStart);
    throttlePad.addEventListener('touchmove', handleTouchMove);
    throttlePad.addEventListener('touchend', handleTouchEnd);
    throttlePad.addEventListener('touchcancel', handleTouchEnd);
    
    bt_btn.onclick = async () => {
        if (isConnected) return;
        
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [bt_svc_id] }]
            });
            
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(bt_svc_id);
            bt_char = await service.getCharacteristic(bt_char_tx_id);
            
            device.addEventListener('gattserverdisconnected', onDisconnected);
            onConnected();
        } catch (err) {
            console.log('Connection failed:', err);
        }
    };
    
    // Initial setup
    resetThrottle();
    steeringIndicator.style.left = '50%';
    steeringIndicator.style.top = '50%';
})();