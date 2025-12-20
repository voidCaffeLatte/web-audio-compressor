document.addEventListener(
    'DOMContentLoaded',
    async () => {
        const thresholdInputElement = getElementByIdOrThrow('threshold');
        const thresholdValueTextElement = getElementByIdOrThrow('thresholdValue');
        const thresholdField = new InputValueField({
            inputElement: thresholdInputElement,
            valueTextElement: thresholdValueTextElement,
            min: Config.THRESHOLD_MIN,
            max: Config.THRESHOLD_MAX,
            step: Config.THRESHOLD_STEP,
            defaultValue: Config.THRESHOLD_DEFAULT,
        });

        const ratioInputElement = getElementByIdOrThrow('ratio');
        const ratioValueTextElement = getElementByIdOrThrow('ratioValue');
        const ratioField = new InputValueField({
            inputElement: ratioInputElement,
            valueTextElement: ratioValueTextElement,
            min: Config.RATIO_MIN,
            max: Config.RATIO_MAX,
            step: Config.RATIO_STEP,
            defaultValue: Config.RATIO_DEFAULT,
        });

        const attackInputElement = getElementByIdOrThrow('attack');
        const attackValueTextElement = getElementByIdOrThrow('attackValue');
        const attackField = new InputValueField({
            inputElement: attackInputElement,
            valueTextElement: attackValueTextElement,
            min: Config.ATTACK_MIN,
            max: Config.ATTACK_MAX,
            step: Config.ATTACK_STEP,
            defaultValue: Config.ATTACK_DEFAULT,
        });

        const releaseInputElement = getElementByIdOrThrow('release');
        const releaseValueTextElement = getElementByIdOrThrow('releaseValue');
        const releaseField = new InputValueField({
            inputElement: releaseInputElement,
            valueTextElement: releaseValueTextElement,
            min: Config.RELEASE_MIN,
            max: Config.RELEASE_MAX,
            step: Config.RELEASE_STEP,
            defaultValue: Config.RELEASE_DEFAULT,
        });

        const kneeInputElement = getElementByIdOrThrow('knee');
        const kneeValueTextElement = getElementByIdOrThrow('kneeValue');
        const kneeField = new InputValueField({
            inputElement: kneeInputElement,
            valueTextElement: kneeValueTextElement,
            min: Config.KNEE_MIN,
            max: Config.KNEE_MAX,
            step: Config.KNEE_STEP,
            defaultValue: Config.KNEE_DEFAULT,
        });

        const enableToggle = getElementByIdOrThrow('enableToggle');

        const updateUIFromConfig = (config) => {
            thresholdField.set(config.threshold);
            ratioField.set(config.ratio);
            attackField.set(config.attack);
            releaseField.set(config.release);
            kneeField.set(config.knee);
            enableToggle.checked = config.enabled;
        };

        const outputMeterElement = getElementByIdOrThrow('outputMeter');
        const reductionMeterElement = getElementByIdOrThrow('reductionMeter');
        const outputValueTextElement = getElementByIdOrThrow('outputValue');
        const reductionValueTextElement = getElementByIdOrThrow('reductionValue');
        const audioLevelStatusIconElement = getElementByIdOrThrow('audioLevelStatusIcon');

        const getActiveTab = async () => {
            const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
            return tab ?? null;
        };

        const updateAudioLevelMeters = (() => {
            let running = false;

            return async () => {
                if (running) return;

                running = true;
                try {
                    const tab = await getActiveTab();
                    if (!tab?.id) {
                        audioLevelStatusIconElement.textContent = '⚠️';
                        audioLevelStatusIconElement.title = 'Unable to read audio level';
                        return;
                    }

                    const response = await chrome.tabs.sendMessage(tab.id, {action: 'getMeterData'});

                    audioLevelStatusIconElement.textContent = '✅';
                    audioLevelStatusIconElement.title = 'Reading audio level';

                    const output = response.output;
                    const reduction = response.reduction;

                    // Convert dB values to a 0–100% range
                    const outputPercent = toPercent(output, ANALYSER_DB_MIN, ANALYSER_DB_MAX);
                    const reductionPercent = clamp(reduction, 0, 100);

                    outputMeterElement.style.width = `${outputPercent}%`;
                    reductionMeterElement.style.width = `${reductionPercent}%`;

                    outputValueTextElement.textContent = output === null ? '-∞' : output.toFixed(2);
                    reductionValueTextElement.textContent = reduction.toFixed(2);
                } catch (error) {
                    audioLevelStatusIconElement.textContent = '⚠️';
                    audioLevelStatusIconElement.title = 'Unable to read audio level';

                    const isKnownMessagingError = error instanceof Error && (
                        error.message.includes('Could not establish connection') ||
                        error.message.includes('The message port closed')
                    );

                    if (isKnownMessagingError) {
                        // Messaging can fail if the content script is not injected or the tab cannot respond.
                        return;
                    }

                    throw error;
                } finally {
                    running = false;
                }
            };
        })();

        const storedData = await chrome.storage.sync.get([Config.CONFIG_STORAGE_KEY]);
        let currentConfig;
        try {
            currentConfig = Config.fromStorageData(storedData);
        } catch (error) {
            console.error('Failed to load config from storage. Falling back to defaults.', error);
            currentConfig = Config.createDefault();
        }

        updateUIFromConfig(currentConfig);
        const _ = updateAudioLevelMeters();

        enableToggle.addEventListener(
            'change',
            async () => {
                const newEnabled = enableToggle.checked;
                let nextConfig;
                try {
                    nextConfig = new Config({...currentConfig, enabled: newEnabled});
                } catch (error) {
                    console.error('Failed to update config. Falling back to defaults.', error);
                    nextConfig = Config.createDefault();
                    updateUIFromConfig(nextConfig);
                }

                await chrome.storage.sync.set({[Config.CONFIG_STORAGE_KEY]: nextConfig.toStorageData()});
                currentConfig = nextConfig;
            }
        );

        const applyButtonElement = getElementByIdOrThrow('apply');
        const applyStatusTextElement = getElementByIdOrThrow('status');
        applyButtonElement.addEventListener(
            'click',
            async () => {
                let nextConfig;
                try {
                    nextConfig = new Config({
                        enabled: enableToggle.checked,
                        threshold: thresholdField.getNumber(),
                        ratio: ratioField.getNumber(),
                        attack: attackField.getNumber(),
                        release: releaseField.getNumber(),
                        knee: kneeField.getNumber(),
                    });
                } catch (error) {
                    console.error('Failed to apply config. Falling back to defaults.', error);
                    nextConfig = Config.createDefault();
                    updateUIFromConfig(nextConfig);
                }

                await chrome.storage.sync.set({[Config.CONFIG_STORAGE_KEY]: nextConfig.toStorageData()});
                currentConfig = nextConfig;

                applyStatusTextElement.textContent = '✅ Applied!';
            }
        );

        const timerId = setInterval(updateAudioLevelMeters, METER_UPDATE_INTERVAL_MS);
        window.addEventListener('unload', () => clearInterval(timerId));
    }
);
