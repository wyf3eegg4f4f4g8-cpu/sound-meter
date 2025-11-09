class SoundMonitor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isMonitoring = false;
        this.animationId = null;
        this.calibrationOffset = 0; // Для калибровки микрофона
        
        console.log("Инициализация измерителя громкости...");
        
        this.initializeElements();
        this.setupEventListeners();
        this.calibrateMicrophone();
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.volumeIndicator = document.getElementById('volumeIndicator');
        this.statusText = document.getElementById('statusText');
        this.volumeValue = document.getElementById('volumeValue');
        this.levelText = document.getElementById('levelText');
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => {
            console.log("Запуск измерения...");
            this.startMonitoring();
        });
        
        this.stopBtn.addEventListener('click', () => {
            console.log("Остановка измерения...");
            this.stopMonitoring();
        });
    }

    // Калибровка для разных микрофонов
    calibrateMicrophone() {
        // Базовая калибровка - можно настроить под ваш микрофон
        this.calibrationOffset = 25; // Смещение для получения реалистичных значений
    }

    async startMonitoring() {
        try {
            console.log("Запрос доступа к микрофону...");
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false,
                    sampleRate: 44100,
                    channelCount: 1
                },
                video: false
            });
            
            console.log("Доступ к микрофону получен!");
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100
            });
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 1024; // Уменьшено для лучшей производительности
            this.analyser.smoothingTimeConstant = 0.5; // Меньше сглаживания для быстрого отклика
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            this.isMonitoring = true;
            this.updateUI(true);
            
            console.log("Запуск мониторинга громкости...");
            this.monitorVolume();
            
        } catch (error) {
            console.error('Ошибка доступа к микрофону:', error);
            this.handleMicrophoneError(error);
        }
    }

    stopMonitoring() {
        console.log("Останавливаем измерение...");
        
        this.isMonitoring = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone.mediaStream.getTracks().forEach(track => {
                track.stop();
                console.log("Трек микрофона остановлен");
            });
        }
        
        if (this.audioContext) {
            this.audioContext.close().then(() => {
                console.log("Аудио контекст закрыт");
            });
        }
        
        this.updateUI(false);
    }

    monitorVolume() {
        if (!this.isMonitoring) return;

        try {
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(dataArray);
            
            // Вычисляем среднее значение с учетом только значимых частот
            let sum = 0;
            let count = 0;
            
            // Анализируем средние частоты (игнорируем очень низкие и высокие)
            for (let i = 10; i < dataArray.length - 10; i++) {
                sum += dataArray[i];
                count++;
            }
            
            const average = count > 0 ? sum / count : 0;
            
            // Правильное преобразование в dB с калибровкой
            const db = this.convertToRealisticDB(average);
            
            this.updateVolumeDisplay(db);
            
            this.animationId = requestAnimationFrame(() => this.monitorVolume());
            
        } catch (error) {
            console.error('Ошибка в цикле мониторинга:', error);
            this.stopMonitoring();
        }
    }

    convertToRealisticDB(value) {
        if (value <= 1) return 0; // Тишина
        
        // Правильная формула преобразования в dB
        // Значение от 0 до 255 преобразуем в реалистичный диапазон dB
        const normalized = value / 255;
        
        // Логарифмическое преобразование (основная формула для dB)
        let db = 20 * Math.log10(normalized);
        
        // Калибровка для получения реалистичных значений
        // Типичный диапазон: тишина ~20 dB, разговор ~60 dB, крик ~80 dB
        db = db + 100 + this.calibrationOffset; // Смещение для реалистичных значений
        
        // Ограничиваем диапазон
        db = Math.max(0, Math.min(120, db));
        
        return Math.round(db);
    }

    updateVolumeDisplay(db) {
        this.volumeValue.textContent = db;
        
        // Правильные уровни громкости
        if (db >= 60) {
            // 60+ dB: Очень шумно
            this.setIndicatorState('red', `ОЧЕНЬ ШУМНО: ${db} dB`, "Очень шумно");
        } else if (db >= 50) {
            // 50-60 dB: Шумно
            this.setIndicatorState('orange', `ШУМНО: ${db} dB`, "Шумно");
        } else if (db >= 25) {
            // 25-50 dB: Ощутимо слышно
            this.setIndicatorState('green', `ОЩУТИМО СЛЫШНО: ${db} dB`, "Ощутимо слышно");
        } else if (db >= 10) {
            // 10-25 dB: Едва слышно
            this.setIndicatorState('blue', `ЕДВА СЛЫШНО: ${db} dB`, "Едва слышно");
        } else {
            // 0-10 dB: Практически бесшумно
            this.setIndicatorState('blue', `ПРАКТИЧЕСКИ БЕСШУМНО: ${db} dB`, "Бесшумно");
        }
    }

    setIndicatorState(color, text, level) {
        this.volumeIndicator.className = `indicator ${color}`;
        this.statusText.textContent = text;
        this.levelText.textContent = level;
    }

    updateUI(isMonitoring) {
        this.startBtn.disabled = isMonitoring;
        this.stopBtn.disabled = !isMonitoring;
        
        if (isMonitoring) {
            this.startBtn.style.opacity = '0.6';
            this.stopBtn.style.opacity = '1';
        } else {
            this.startBtn.style.opacity = '1';
            this.stopBtn.style.opacity = '0.6';
            this.setIndicatorState('idle', 'Измерение остановлено', '-');
            this.volumeValue.textContent = '0';
        }
    }

    handleMicrophoneError(error) {
        let errorMessage = 'Неизвестная ошибка';
        
        switch (error.name) {
            case 'NotAllowedError':
                errorMessage = 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
                break;
            case 'NotFoundError':
                errorMessage = 'Микрофон не найден. Убедитесь, что микрофон подключен и включен.';
                break;
            case 'NotSupportedError':
                errorMessage = 'Ваш браузер не поддерживает доступ к микрофону.';
                break;
            case 'NotReadableError':
                errorMessage = 'Микрофон используется другой программой. Закройте другие программы, использующие микрофон.';
                break;
            default:
                errorMessage = `Ошибка: ${error.message}`;
        }
        
        this.statusText.textContent = `${errorMessage}`;
        this.volumeIndicator.className = 'indicator red';
        
        setTimeout(() => {alert(`Проблема с доступом к микрофону:\n\n${errorMessage}`);
    }, 500);
}
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
console.log("Запуск Sound Meter...");

try {
    window.soundMonitor = new SoundMonitor();
    console.log("Sound Meter успешно запущен");
} catch (error) {
    console.error('Ошибка при запуске:', error);
}
});