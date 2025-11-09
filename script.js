class SoundMonitor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isMonitoring = false;
        this.animationId = null;
        this.dataArray = null;
        this.volumeHistory = [];
        this.historySize = 10;
        
        console.log("Инициализация измерителя громкости...");
        
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
                    echoCancellation: false,  // Отключаем для более точных измерений
                    noiseSuppression: false,  // Отключаем шумоподавление
                    autoGainControl: false,   // Отключаем автоусиление
                    sampleRate: 44100,
                    channelCount: 1,
                    volume: 1.0
                },
                video: false
            });
            
            console.log("Доступ к микрофону получен!");
            
            // Создаем аудиоконтекст
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Создаем анализатор
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;  // Увеличиваем для большей точности
            this.analyser.smoothingTimeConstant = 0.2;  // Меньше сглаживания
            
            // Создаем массив для данных
            this.dataArray = new Float32Array(this.analyser.fftSize);
            
            // Подключаем микрофон
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
            // Получаем данные в формате Float32Array для большей точности
            this.analyser.getFloatTimeDomainData(this.dataArray);
            
            // Вычисляем RMS (среднеквадратичное значение)
            const rms = this.calculateRMS(this.dataArray);
            
            // Преобразуем в децибелы
            const db = this.rmsToDB(rms);
            
            // Добавляем в историю для сглаживания
            this.volumeHistory.push(db);
            if (this.volumeHistory.length > this.historySize) {
                this.volumeHistory.shift();
            }
            
            // Вычисляем среднее значение для сглаживания
            const smoothedDB = this.getSmoothedVolume();
            
            this.updateVolumeDisplay(smoothedDB);
            
            this.animationId = requestAnimationFrame(() => this.monitorVolume());
            
        } catch (error) {
            console.error('Ошибка в цикле мониторинга:', error);
            this.stopMonitoring();
        }
    }

    // Вычисление среднеквадратичного значения
    calculateRMS(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }

    // Преобразование RMS в децибелы
    rmsToDB(rms) {
        if (rms < 0.0001) return 0; // Практически тишина
        
        // Преобразование в dBFS (децибелы относительно полной шкалы)
        let db = 20 * Math.log10(rms);
        
        // Нормализация к реалистичному диапазону
        // Типичные значения: тишина ~30dB, разговор ~60dB, крик ~80dB
        db = db + 100; // Смещение
        
        // Ограничение диапазона
        db = Math.max(0, Math.min(120, db));
        
        return Math.round(db);
    }

    // Сглаживание значений для устранения скачков
    getSmoothedVolume() {
        if (this.volumeHistory.length === 0) return 0;
        
        let sum = 0;
        for (let i = 0; i < this.volumeHistory.length; i++) {
            sum += this.volumeHistory[i];
        }
        return Math.round(sum / this.volumeHistory.length);
    }

    updateVolumeDisplay(db) {
        this.volumeValue.textContent = db;
        
        // Обновленные уровни громкости с реалистичными значениями
        if (db >= 60) {
            // 60+ dB: Очень шумно (крик, строительные работы)
            this.setIndicatorState('red', `ОЧЕНЬ ШУМНО: ${db} dB`, "Очень шумно");
        } else if (db >= 50) {
            // 50-60 dB: Шумно (громкий разговор, телевизор)
            this.setIndicatorState('orange', `ШУМНО: ${db} dB`, "Шумно");
        } else if (db >= 35) {
            // 35-50 dB: Ощутимо слышно (обычный разговор)
            this.setIndicatorState('green', `ОЩУТИМО СЛЫШНО: ${db} dB`, "Ощутимо слышно");
        } else if (db >= 20) {
            // 20-35 dB: Едва слышно (шепот, тиканье часов)
            this.setIndicatorState('blue', `ЕДВА СЛЫШНО: ${db} dB`, "Едва слышно");
        } else {
            // 0-20 dB: Практически бесшумно (тихая комната)
            this.setIndicatorState('blue', `БЕСШУМНО: ${db} dB`, "Бесшумно");
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
        
        setTimeout(() => {
            alert(`Проблема с доступом к микрофону:\n\n${errorMessage}`);
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