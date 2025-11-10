class SoundMonitor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isMonitoring = false;
        this.animationId = null;
        this.dataArray = null;
        this.volumeHistory = [];
        this.historySize = 10; // Уменьшил для меньшего сглаживания
        
        // Правильная калибровка для реалистичных значений
        this.calibration = {
            offset: 45,      // Увеличил для более высоких значений
            multiplier: 1.0, // Без лишнего умножения
            minDB: 0,
            maxDB: 100
        };
        
        console.log("Инициализация звукового светофора...");
        
        this.initializeElements();
        this.setupEventListeners();
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

    async startMonitoring() {
        try {
            console.log("Запрос доступа к микрофону...");
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,  // Выключил для более точного измерения
                    noiseSuppression: false,  // Выключил шумоподавление
                    autoGainControl: false,
                    sampleRate: 44100,
                    channelCount: 1
                },
                video: false
            });
            
            console.log("Доступ к микрофону получен!");
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Оптимальные настройки для баланса точности и плавности
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.6; // Хороший баланс
            this.analyser.minDecibels = -60;
            this.analyser.maxDecibels = -10;
            
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
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
        this.volumeHistory = [];
        
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
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // Улучшенное вычисление с акцентом на речевые частоты
            const average = this.calculateSpeechFocusedAverage(this.dataArray);
            
            // Правильное преобразование с увеличенными значениями
            const db = this.convertToRealisticDB(average);
            
            // Сглаживание для устранения резкости
            this.volumeHistory.push(db);
            if (this.volumeHistory.length > this.historySize) {
                this.volumeHistory.shift();
            }
            
            const smoothedDB = this.getSmoothedValue();
            this.updateVolumeDisplay(smoothedDB);
            
            this.animationId = requestAnimationFrame(() => this.monitorVolume());
            
        } catch (error) {
            console.error('Ошибка в цикле мониторинга:', error);
            this.stopMonitoring();
        }
    }

    calculateSpeechFocusedAverage(data) {
        let sum = 0;
        let count = 0;
        
        // Фокусируемся на средних частотах (речевой диапазон 300-3400 Гц)
        // Это дает более реалистичные значения для голоса
        const start = Math.floor(data.length * 0.1);  // 10% - начало речевых частот
        const end = Math.floor(data.length * 0.7);    // 70% - конец речевых частот
        
        for (let i = start; i < end; i++) {
            sum += data[i];
            count++;
        }
        
        return count > 0 ? sum / count : 0;
    }

    convertToRealisticDB(value) {
        if (value < 1) return 0;
        
        // Увеличенная формула для более высоких значений
        let db = 25 * Math.log10(value / 255); // Увеличил множитель
        
        // Большее смещение для реалистичных значений
        db = db + 100 + this.calibration.offset;
        
        // Ограничение и округление
        db = Math.max(0, Math.min(100, db));
        
        return Math.round(db);
    }

    getSmoothedValue() {
        if (this.volumeHistory.length === 0) return 0;
        
        // Медианный фильтр для устранения резких скачков
        const sorted = [...this.volumeHistory].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        
        return sorted.length % 2 !== 0 ? 
            sorted[mid] : 
            Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    updateVolumeDisplay(db) {
        this.volumeValue.textContent = db;
        
        // Теперь значения должны быть реалистичными:
        if (db >= 70) {
            this.setIndicatorState('red', `КРАЙНЕ ШУМНО`, "Крайне шумно", db);
        } else if (db >= 50) {
            this.setIndicatorState('orange', `ШУМНО`, "Шумно", db);
        } else if (db >= 35) {
            this.setIndicatorState('green', `ОЩУТИМО СЛЫШНО`, "Ощутимо слышно", db);
        } else if (db >= 15) {
            this.setIndicatorState('blue', `ТИХО`, "Тихо", db);
        } else {
            this.setIndicatorState('purple', `ОЧЕНЬ ТИХО`, "Очень тихо", db);
        }
    }

    setIndicatorState(color, text, level, db) {
        this.volumeIndicator.className = `indicator-circle ${color}`;
        this.statusText.textContent = `${text}: ${db} dB`;
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
            this.setIndicatorState('idle', 'Измерение остановлено', '-', 0);
            this.volumeValue.textContent = '0';
        }
    }

    handleMicrophoneError(error) {
        let errorMessage = 'Неизвестная ошибка';
        
        switch (error.name) {
            case 'NotAllowedError':
                errorMessage = 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
                break;
            case 'NotFoundError':errorMessage = 'Микрофон не найден. Убедитесь, что микрофон подключен и включен.';
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
    this.volumeIndicator.className = 'indicator-circle red';
    
    setTimeout(() => {
        alert(`Проблема с доступом к микрофону:\n\n${errorMessage}`);
    }, 500);
}
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
console.log("Запуск Звукового светофора...");

try {
    window.soundMonitor = new SoundMonitor();
    console.log("Звуковой светофор успешно запущен");
} catch (error) {
    console.error('Ошибка при запуске:', error);
}
});