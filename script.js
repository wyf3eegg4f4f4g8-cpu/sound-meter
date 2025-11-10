class SoundMonitor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isMonitoring = false;
        this.animationId = null;
        this.dataArray = null;
        this.volumeHistory = [];
        this.historySize = 15;
        
        // Улучшенная калибровка для реалистичных значений
        this.calibration = {
            offset: 35,      // Увеличено для коррекции заниженных значений
            multiplier: 1.3, // Оптимизированный множитель
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
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100,
                    channelCount: 1
                },
                video: false
            });
            
            console.log("Доступ к микрофону получен!");
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Оптимальные настройки для точного измерения
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.2; // Минимальное сглаживание для быстрого отклика
            this.analyser.minDecibels = -60;           // Расширенный диапазон
            this.analyser.maxDecibels = 0;
            
            this.dataArray = new Float32Array(this.analyser.fftSize);
            
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
            // Получаем данные амплитуды
            this.analyser.getFloatTimeDomainData(this.dataArray);
            
            // Вычисляем RMS с улучшенной точностью
            const rms = this.calculateEnhancedRMS(this.dataArray);
            
            // Преобразуем в децибелы с коррекцией
            const db = this.rmsToCalibratedDB(rms);
            
            // Сглаживание для плавности (без потери чувствительности)
            this.volumeHistory.push(db);
            if (this.volumeHistory.length > this.historySize) {
                this.volumeHistory.shift();
            }
            
            const smoothedDB = this.getWeightedAverage();
            this.updateVolumeDisplay(smoothedDB);
            
            this.animationId = requestAnimationFrame(() => this.monitorVolume());
            
        } catch (error) {
            console.error('Ошибка в цикле мониторинга:', error);
            this.stopMonitoring();
        }
    }

    calculateEnhancedRMS(data) {
        let sum = 0;
        let count = 0;
        
        // Анализируем только значимые части сигнала (игнорируем шумы)
        for (let i = 0; i < data.length; i++) {
            // Учитываем только значения выше порога шума
            if (Math.abs(data[i]) > 0.001) {
                sum += data[i] * data[i];
                count++;
            }
        }
        
        return count > 0 ? Math.sqrt(sum / count) : 0;
    }

    rmsToCalibratedDB(rms) {
        if (rms < 0.0001) return 0;
        
        // Базовая формула преобразования
        let db = 20.0 * Math.log10(rms);
        
        // Калибровка для реалистичных значений
        // Добавляем коррекцию +10-15 dB для компенсации занижения
        db = (db + 95) * this.calibration.multiplier + this.calibration.offset;
        
        // Ограничение диапазона
        db = Math.max(this.calibration.minDB, Math.min(this.calibration.maxDB, db));
        
        return Math.round(db);
    }

    getWeightedAverage() {
        if (this.volumeHistory.length === 0) return 0;
        
        // Взвешенное среднее - новые значения имеют больший вес
        let sum = 0;
        let weightSum = 0;
        
        for (let i = 0; i < this.volumeHistory.length; i++) {
            const weight = (i + 1) / this.volumeHistory.length; // Линейное взвешивание
            sum += this.volumeHistory[i] * weight;
            weightSum += weight;
        }
        
        return Math.round(sum / weightSum);
    }

    updateVolumeDisplay(db) {
        this.volumeValue.textContent = db;
        
        // Сохраняем оригинальные уровни громкости
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

    // Функция для точной калибровки под ваш микрофон
    calibrateForMicrophone() {
        // Автоматическая калибровка +12 dB для компенсации
        this.calibration.offset += 12;
        console.log("Автоматическая калибровка: +12 dB применено");
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
        
        // Автоматическая калибровка при запуске
        setTimeout(() => {
            window.soundMonitor.calibrateForMicrophone();
        }, 1000);
        
    } catch (error) {
        console.error('Ошибка при запуске:', error);
    }
});