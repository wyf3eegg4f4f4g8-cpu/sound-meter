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
        
        this.calibration = {
            offset: 30,      // Увеличено для смещения в нужный диапазон
            multiplier: 1.5, // Настроено для правильных значений
            minDB: 0,        // Минимальный уровень - 0 dB
            maxDB: 100       // Максимальный уровень
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
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 1024;
            this.analyser.smoothingTimeConstant = 0.8;
            
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
            this.analyser.getFloatTimeDomainData(this.dataArray);
            
            const rms = this.calculateRMS(this.dataArray);
            const db = this.rmsToDB(rms);
            
            this.volumeHistory.push(db);
            if (this.volumeHistory.length > this.historySize) {
                this.volumeHistory.shift();
            }
            
            const smoothedDB = this.getSmoothedVolume();
            this.updateVolumeDisplay(smoothedDB);
            
            this.animationId = requestAnimationFrame(() => this.monitorVolume());
        } catch (error) {
            console.error('Ошибка в цикле мониторинга:', error);
            this.stopMonitoring();
        }
    }

    calculateRMS(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }

    rmsToDB(rms) {
        if (rms < 0.00001) return 0;
        
        let db = 15 * Math.log10(rms * 100);
        db = db + 40;
        db = Math.max(0, Math.min(100, db));
        
        return Math.round(db);
    }

    getSmoothedVolume() {
        if (this.volumeHistory.length === 0) return 0;
        
        let sum = 0;
        let weightSum = 0;
        
        for (let i = 0; i < this.volumeHistory.length; i++) {
            const weight = (i + 1) / this.volumeHistory.length;
            sum += this.volumeHistory[i] * weight;
            weightSum += weight;
        }
        
        return Math.round(sum / weightSum);
    }

    updateVolumeDisplay(db) {
        this.volumeValue.textContent = db;
        
        // Обновленные уровни громкости по новым требованиям
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
    } catch (error) {
        console.error('Ошибка при запуске:', error);
    }
});