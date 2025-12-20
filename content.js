(async () => {
    const storedConfigData = await chrome.storage.sync.get([Config.CONFIG_STORAGE_KEY]);
    let currentConfig;
    try {
        currentConfig = Config.fromStorageData(storedConfigData);
    } catch (error) {
        console.error('Failed to load config from storage. Falling back to defaults.', error);
        currentConfig = Config.createDefault();
    }

    const audioContextLazy = createLazy(() => new (window.AudioContext ?? window.webkitAudioContext)());
    const outputAnalyserLazy = createLazy(() => {
        const audioContext = audioContextLazy.get();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.minDecibels = ANALYSER_DB_MIN;
        analyser.maxDecibels = ANALYSER_DB_MAX;
        analyser.smoothingTimeConstant = 0.0;
        analyser.connect(audioContext.destination);
        return analyser;
    });
    const compressorLazy = createLazy(() => {
        const audioContext = audioContextLazy.get();
        const outputAnalyser = outputAnalyserLazy.get();
        const compressor = audioContext.createDynamicsCompressor();
        compressor.connect(outputAnalyser);
        return compressor;
    });

    const sourceNodes = new WeakMap();

    const updateCompressor = (config) => {
        const hasCompressor = compressorLazy.peek() !== undefined;
        if (!hasCompressor && !config.enabled) return;

        const compressor = compressorLazy.get();
        compressor.threshold.value = config.threshold;
        compressor.ratio.value = config.ratio;
        compressor.attack.value = config.attack;
        compressor.release.value = config.release;
        compressor.knee.value = config.knee;
    };

    const scheduleConnectMediaElements = (() => {
        const connectMediaElements = (enabled) => {
            const mediaElements = document.querySelectorAll('video, audio');
            if (mediaElements.length === 0) return;

            const audioContext = audioContextLazy.get();
            const targetNode = enabled ? compressorLazy.get() : outputAnalyserLazy.get();

            for (const mediaElement of mediaElements) {
                let source = sourceNodes.get(mediaElement);
                if (!source) {
                    try {
                        source = audioContext.createMediaElementSource(mediaElement);
                        sourceNodes.set(mediaElement, source);
                    } catch (_error) {
                        continue;
                    }
                }

                try {
                    source.disconnect();
                } catch (_error) {
                    // ignore
                }

                source.connect(targetNode);
            }
        };

        let scheduled = false;
        return (enabled) => {
            if (scheduled) return;

            scheduled = true;
            Promise.resolve().then(() => {
                scheduled = false;
                connectMediaElements(enabled);
            });
        };
    })();

    updateCompressor(currentConfig);
    scheduleConnectMediaElements(currentConfig.enabled);

    const observer = new MutationObserver((_mutations) => scheduleConnectMediaElements(currentConfig.enabled));
    observer.observe(document.body, {childList: true, subtree: true});

    chrome.storage.onChanged.addListener(
        (changes, areaName) => {
            if (areaName !== 'sync') return;
            if (!Object.prototype.hasOwnProperty.call(changes, Config.CONFIG_STORAGE_KEY)) return;

            let nextConfig;
            try {
                nextConfig = Config.fromStorageData({
                    [Config.CONFIG_STORAGE_KEY]: changes[Config.CONFIG_STORAGE_KEY].newValue,
                });
            } catch (error) {
                console.error('Failed to read updated config from storage. Falling back to defaults.', error);
                nextConfig = Config.createDefault();
            }

            const shouldReconnect = currentConfig.enabled !== nextConfig.enabled;

            currentConfig = nextConfig;

            updateCompressor(nextConfig);
            if (shouldReconnect) scheduleConnectMediaElements(nextConfig.enabled);
        }
    );

    chrome.runtime.onMessage.addListener(
        (request, _sender, sendResponse) => {
            if (request.action === 'getMeterData') {
                const outputAnalyser = outputAnalyserLazy.get();
                const outputArray = new Float32Array(outputAnalyser.fftSize);
                outputAnalyser.getFloatTimeDomainData(outputArray);

                let sumSquares = 0;
                for (const amplitude of outputArray) {
                    sumSquares += amplitude * amplitude;
                }

                const outputRMS = Math.sqrt(sumSquares / outputArray.length);

                const outputDb = outputRMS < 0.0001 ? null : 20 * Math.log10(outputRMS);

                const enabled = currentConfig.enabled;
                const compressor = enabled ? compressorLazy.get() : compressorLazy.peek();
                const reduction = enabled && compressor ? compressor.reduction : 0;

                sendResponse({
                    output: outputDb,
                    reduction: Math.abs(reduction)
                });

                return;
            }
        }
    );
})();
